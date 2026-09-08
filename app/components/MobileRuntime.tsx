"use client";

import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import {
  BarcodeFormat,
  DecodeHintType,
  NotFoundException,
} from "@zxing/library";
import { useEffect, useRef, useState } from "react";
import {parseGs1} from '../../lib/gs1';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
type StoreRequestOption={item_id:string;sku:string;description:string;base_uom:string;uom:string;factor:string;barcodes:string[]};

const hints = new Map<DecodeHintType, unknown>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.CODE_128,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.RSS_14,
      BarcodeFormat.RSS_EXPANDED,
    ],
  ],
  [DecodeHintType.TRY_HARDER, true],
]);

export default function MobileRuntime() {
  const [online, setOnline] = useState(true);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [message, setMessage] = useState("Point the camera at a barcode");
  const video = useRef<HTMLVideoElement>(null);
  const target = useRef<HTMLInputElement | null>(null);
  const controls = useRef<IScannerControls | null>(null);
  const completed = useRef(false);
  const startRef = useRef<(input: HTMLInputElement) => void>(() => undefined);

  function applyScan(input: HTMLInputElement, raw: string) {
    const gs1 = parseGs1(raw.trim());
    const value =
      (input.name === "barcode" ||
        input.name === "receiptBarcode" ||
        input.name === "scan") &&
      gs1.item
        ? gs1.item
        : raw.trim();
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    const form = input.form;
    if (form) {
      const fill = (name: string, value?: string) => {
        if (!value) return;
        const field = form.elements.namedItem(name) as
          HTMLInputElement | HTMLTextAreaElement | null;
        if (field && !field.value) {
          field.value = value;
          field.dispatchEvent(new Event("input", { bubbles: true }));
        }
      };
      fill("lotNumber", gs1.lot);
      fill("expiryDate", gs1.expiry);
      fill("serialNumbers", gs1.serial);
    }
    input.focus();
    return gs1;
  }

  useEffect(() => {
    queueMicrotask(() => setOnline(navigator.onLine));
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const before = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    addEventListener("online", on);
    addEventListener("offline", off);
    addEventListener("beforeinstallprompt", before);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);

    const enhance = () => {
      const scanLabel = (name: string, title: string, placeholder: string) => {
        const label = document.createElement("label");
        label.textContent = title;
        const input = document.createElement("input");
        input.name = name;
        input.required = true;
        input.placeholder = placeholder;
        input.dataset.scanField = "true";
        label.append(input);
        return label;
      };
      document
        .querySelectorAll<HTMLFormElement>('form[action*="/api/store-deliveries/"]')
        .forEach((form) => {
          if (form.dataset.enforcedScans) return;
          form.dataset.enforcedScans = "true";
          const scanRow = document.createElement("div");
          scanRow.className = "form-row store-enforced-scans";
          scanRow.append(
            scanLabel("shipmentBarcode", "Delivery label", "Scan shipment, order, or tracking label"),
            scanLabel("locationCode", "Receiving locator", "Scan receiving or backroom locator"),
          );
          form.querySelector("p")?.insertAdjacentElement("afterend", scanRow);
          form.querySelectorAll<HTMLInputElement>('input[name^="accepted_"]').forEach((quantity) => {
            const lineId = quantity.name.slice("accepted_".length);
            const panel = quantity.closest<HTMLElement>(".panel");
            if (!panel || panel.querySelector(`[name="barcode_${lineId}"]`)) return;
            const label = scanLabel(`barcode_${lineId}`, "Confirm item barcode or SKU", "Scan the item label");
            panel.querySelector("p")?.insertAdjacentElement("afterend", label);
          });
        });
      document
        .querySelectorAll<HTMLFormElement>('form[action$="/api/store-transactions"]')
        .forEach((form) => {
          if (form.dataset.enforcedScans) return;
          form.dataset.enforcedScans = "true";
          const transaction = form.querySelector('select[name="transactionType"]')?.closest("label");
          transaction?.insertAdjacentElement("afterend", scanLabel("locationCode", "Source locator", "Scan the active store locator"));
          const item = form.querySelector('select[name="itemId"]')?.closest("label");
          item?.insertAdjacentElement("afterend", scanLabel("barcode", "Confirm item barcode or SKU", "Scan the selected item"));
        });
      document
        .querySelectorAll<HTMLFormElement>('form[action$="/api/store-requests"]')
        .forEach((form) => {
          if (form.dataset.batchLines) return;
          form.dataset.batchLines = "true";
          const itemLabel = form.querySelector<HTMLSelectElement>('select[name="itemId"]')?.closest("label");
          const quantityLabel = form.querySelector<HTMLInputElement>('input[name="quantity"]')?.closest("label");
          const dateLabel = form.querySelector<HTMLInputElement>('input[name="requestedShipDate"]')?.closest("label");
          const submit = form.querySelector<HTMLButtonElement>('button[type="submit"],button:not([type])');
          if (!itemLabel || !quantityLabel || !dateLabel || !submit) return;
          const note=form.querySelector<HTMLElement>(".form-note");if(note)note.textContent="Add one or more items, choose a registered request unit, and enter quantity in that unit. Warevanta normalizes each line to its base unit.";
          submit.disabled = true;
          const itemTemplate = itemLabel.cloneNode(true) as HTMLLabelElement;
          const quantityTemplate = quantityLabel.cloneNode(true) as HTMLLabelElement;
          void fetch("/api/store-request-options",{cache:"no-store"}).then(async response=>{
            if(!response.ok)throw new Error("options");
            const options=(await response.json() as {options:StoreRequestOption[]}).options;
            const lines = document.createElement("div");
            lines.className = "store-request-lines";
            const createLine = (item: HTMLLabelElement, quantity: HTMLLabelElement, removable: boolean) => {
              const row = document.createElement("div");
              row.className = "form-row store-request-line";
              const itemSelect=item.querySelector<HTMLSelectElement>('select[name="itemId"]')!;
              const uomLabel=document.createElement("label"),uomSelect=document.createElement("select"),hint=document.createElement("small");
              uomLabel.textContent="Request unit";uomSelect.name="requestUom";uomSelect.required=true;uomLabel.append(uomSelect,hint);
              const updateHint=()=>{const selected=options.find(option=>option.item_id===itemSelect.value&&option.uom===uomSelect.value);hint.textContent=selected?`1 ${selected.uom} = ${selected.factor} ${selected.base_uom}${selected.barcodes.length?` · Barcode ${selected.barcodes.join(', ')}`:''}`:"No active unit conversion"},refreshUoms=()=>{const choices=options.filter(option=>option.item_id===itemSelect.value);uomSelect.replaceChildren(...choices.map(option=>{const entry=document.createElement("option");entry.value=option.uom;entry.textContent=`${option.uom} — ${option.factor} ${option.base_uom}${option.barcodes.length?` · ${option.barcodes.join(', ')}`:' · no barcode'}`;return entry}));updateHint()};
              itemSelect.onchange=refreshUoms;uomSelect.onchange=updateHint;refreshUoms();row.append(item, uomLabel, quantity);
              if (removable) {const remove = document.createElement("button");remove.type = "button";remove.className = "button button-secondary";remove.textContent = "Remove";remove.setAttribute("aria-label", "Remove stock request line");remove.onclick = () => row.remove();row.append(remove)}
              return row;
            };
            lines.append(createLine(itemLabel, quantityLabel, false));dateLabel.parentElement?.insertAdjacentElement("beforebegin", lines);
            const add = document.createElement("button");add.type = "button";add.className = "button button-secondary";add.textContent = "+ Add another item";add.onclick = () => {if (lines.children.length >= 50) return;const item = itemTemplate.cloneNode(true) as HTMLLabelElement,quantity = quantityTemplate.cloneNode(true) as HTMLLabelElement,input = quantity.querySelector<HTMLInputElement>('input[name="quantity"]');if (input) input.value = "";lines.append(createLine(item, quantity, true))};submit.insertAdjacentElement("beforebegin", add);submit.disabled=!options.length;
          }).catch(()=>{const error=document.createElement("p");error.className="form-error";error.textContent="Request units could not be loaded. Refresh the page and try again.";form.append(error)});
        });
      document
        .querySelectorAll<HTMLInputElement>(
          'input[data-scan-field="true"],input[name="barcode"],input[name="receiptBarcode"],input[name="locationCode"],input[name="destinationCode"],input[name="scan"],input[name="trackingNumber"]',
        )
        .forEach((input) => {
          if (input.dataset.mobileScan) return;
          input.dataset.mobileScan = "1";
          const form = input.form;
          if (input.name === "receiptBarcode" && form)
            form.action = form.action.replace(/\/inspect$/, "/mobile-inspect");
          const key = `stockflow-draft:${form?.getAttribute("action") || location.pathname}:${input.name}`;
          const saved = localStorage.getItem(key);
          if (saved && !input.value) input.value = saved;
          input.addEventListener("input", () =>
            localStorage.setItem(key, input.value),
          );
          input.addEventListener("change", () => {
            if (
              input.name === "barcode" ||
              input.name === "receiptBarcode" ||
              input.name === "scan"
            )
              applyScan(input, input.value);
          });
          form?.addEventListener(
            "submit",
            () => {
              if (navigator.onLine) localStorage.removeItem(key);
            },
            { once: true },
          );
          const button = document.createElement("button");
          button.type = "button";
          button.className = "button button-secondary camera-scan-button";
          button.textContent = "📷 Scan with camera";
          button.setAttribute(
            "aria-label",
            `Scan ${input.name} with phone camera`,
          );
          button.onclick = () => startRef.current(input);
          input.insertAdjacentElement("afterend", button);
        });
      document
        .querySelectorAll<HTMLElement>(".success-banner,.form-error")
        .forEach((b) => {
          if (b.dataset.scanFeedback) return;
          b.dataset.scanFeedback = "1";
          if (b.classList.contains("success-banner")) {
            navigator.vibrate?.([80, 40, 80]);
            beep();
          } else navigator.vibrate?.([220, 70, 220]);
        });
    };
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      removeEventListener("online", on);
      removeEventListener("offline", off);
      removeEventListener("beforeinstallprompt", before);
      observer.disconnect();
      controls.current?.stop();
    };
  }, []);

  async function start(input = target.current) {
    if (!input) return;
    target.current = input;
    controls.current?.stop();
    controls.current = null;
    completed.current = false;
    setTorchAvailable(false);
    setTorchOn(false);
    setStarting(true);
    setScanning(true);
    setMessage("Starting the rear camera…");
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    if (!video.current) {
      setStarting(false);
      setMessage(
        "The camera preview could not open. Close the scanner and try again.",
      );
      return;
    }

    try {
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 100,
        delayBetweenScanSuccess: 500,
      });
      const scannerControls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        video.current,
        (result, error) => {
          if (completed.current) return;
          if (result) {
            completed.current = true;
            const value = result.getText().trim();
            const gs1 = applyScan(input, value);
            navigator.vibrate?.(120);
            beep();
            setMessage(
              gs1.item
                ? `GS1 scanned · Item ${gs1.item}${gs1.lot ? ` · Lot ${gs1.lot}` : ""}${gs1.expiry ? ` · Expiry ${gs1.expiry}` : ""}${gs1.serial ? ` · Serial ${gs1.serial}` : ""}`
                : `Scanned: ${value}`,
            );
            setTimeout(stop, 500);
          } else if (error && !(error instanceof NotFoundException)) {
            setMessage(
              "Keep the barcode inside the frame and move the phone slowly closer or farther away.",
            );
          }
        },
      );
      controls.current = scannerControls;
      setTorchAvailable(Boolean(scannerControls.switchTorch));
      setStarting(false);
      setMessage(
        "Center the barcode inside the frame. Hold steady in good light.",
      );
    } catch (error) {
      setStarting(false);
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setMessage(
          "Camera permission is blocked. Allow Camera in this site’s browser settings, then tap Try again.",
        );
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setMessage(
          "No usable rear camera was found. Try another browser or use a Bluetooth scanner.",
        );
      } else {
        setMessage(
          "The camera could not start. Check that no other app is using it, then tap Try again.",
        );
      }
    }
  }

  startRef.current = (input) => {
    void start(input);
  };

  async function toggleTorch() {
    if (!controls.current?.switchTorch) return;
    const next = !torchOn;
    try {
      await controls.current.switchTorch(next);
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
      setMessage("The flashlight is not available with this camera.");
    }
  }

  function beep() {
    try {
      const Audio =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const context = new Audio();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.1);
    } catch {
      /* Sound is optional; vibration and the success message remain. */
    }
  }

  function stop() {
    controls.current?.stop();
    controls.current = null;
    setTorchAvailable(false);
    setTorchOn(false);
    setStarting(false);
    setScanning(false);
  }

  return (
    <>
      <div
        className={`connectivity-pill ${online ? "online" : "offline"}`}
        role="status"
      >
        {online ? "● Online" : "● Offline · scans saved on this phone"}
      </div>
      {install && (
        <button
          className="install-app-button"
          onClick={async () => {
            await install.prompt();
            setInstall(null);
          }}
        >
          Install Warevanta
        </button>
      )}
      {scanning && (
        <div
          className="scanner-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Barcode camera scanner"
        >
          <div className="scanner-card">
            <div className="scanner-frame">
              <video
                ref={video}
                playsInline
                muted
                aria-label="Live rear-camera preview"
              />
              <span />
            </div>
            <p role="status">{message}</p>
            <div className="scanner-actions">
              {torchAvailable && (
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={toggleTorch}
                >
                  {torchOn ? "Turn flashlight off" : "Turn flashlight on"}
                </button>
              )}
              {!controls.current && !starting && (
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => start()}
                >
                  Try camera again
                </button>
              )}
              <button
                className="button button-secondary"
                type="button"
                onClick={stop}
              >
                Close scanner
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
