"use client";

import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, NotFoundException } from "@zxing/library";
import { useEffect, useRef, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const hints = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_128, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
  ]],
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

  useEffect(() => {
    queueMicrotask(() => setOnline(navigator.onLine));
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const before = (event: Event) => { event.preventDefault(); setInstall(event as InstallEvent); };
    addEventListener("online", on);
    addEventListener("offline", off);
    addEventListener("beforeinstallprompt", before);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);

    const enhance = () => document.querySelectorAll<HTMLInputElement>('input[name="barcode"],input[name="receiptBarcode"],input[name="locationCode"],input[name="destinationCode"]').forEach((input) => {
      if (input.dataset.mobileScan) return;
      input.dataset.mobileScan = "1";
      const form = input.form;
      if (input.name === "receiptBarcode" && form) form.action = form.action.replace(/\/inspect$/, "/mobile-inspect");
      const key = `stockflow-draft:${form?.getAttribute("action") || location.pathname}:${input.name}`;
      const saved = localStorage.getItem(key);
      if (saved && !input.value) input.value = saved;
      input.addEventListener("input", () => localStorage.setItem(key, input.value));
      form?.addEventListener("submit", () => { if (navigator.onLine) localStorage.removeItem(key); }, { once: true });
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-secondary camera-scan-button";
      button.textContent = "📷 Scan with camera";
      button.setAttribute("aria-label", `Scan ${input.name} with phone camera`);
      button.onclick = () => startRef.current(input);
      input.insertAdjacentElement("afterend", button);
    });
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
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (!video.current) {
      setStarting(false);
      setMessage("The camera preview could not open. Close the scanner and try again.");
      return;
    }

    try {
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100, delayBetweenScanSuccess: 500 });
      const scannerControls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        video.current,
        (result, error) => {
          if (completed.current) return;
          if (result) {
            completed.current = true;
            const value = result.getText().trim();
            input.value = value;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            input.focus();
            navigator.vibrate?.(120);
            beep();
            setMessage(`Scanned: ${value}`);
            setTimeout(stop, 500);
          } else if (error && !(error instanceof NotFoundException)) {
            setMessage("Keep the barcode inside the frame and move the phone slowly closer or farther away.");
          }
        },
      );
      controls.current = scannerControls;
      setTorchAvailable(Boolean(scannerControls.switchTorch));
      setStarting(false);
      setMessage("Center the barcode inside the frame. Hold steady in good light.");
    } catch (error) {
      setStarting(false);
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setMessage("Camera permission is blocked. Allow Camera in this site’s browser settings, then tap Try again.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setMessage("No usable rear camera was found. Try another browser or use a Bluetooth scanner.");
      } else {
        setMessage("The camera could not start. Check that no other app is using it, then tap Try again.");
      }
    }
  }

  startRef.current = (input) => { void start(input); };

  async function toggleTorch() {
    if (!controls.current?.switchTorch) return;
    const next = !torchOn;
    try { await controls.current.switchTorch(next); setTorchOn(next); }
    catch { setTorchAvailable(false); setMessage("The flashlight is not available with this camera."); }
  }

  function beep() {
    try {
      const Audio = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new Audio();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.1);
    } catch { /* Sound is optional; vibration and the success message remain. */ }
  }

  function stop() {
    controls.current?.stop();
    controls.current = null;
    setTorchAvailable(false);
    setTorchOn(false);
    setStarting(false);
    setScanning(false);
  }

  return <>
    <div className={`connectivity-pill ${online ? "online" : "offline"}`} role="status">
      {online ? "● Online" : "● Offline · scans saved on this phone"}
    </div>
    {install && <button className="install-app-button" onClick={async () => { await install.prompt(); setInstall(null); }}>Install Warevanta</button>}
    {scanning && <div className="scanner-modal" role="dialog" aria-modal="true" aria-label="Barcode camera scanner">
      <div className="scanner-card">
        <div className="scanner-frame"><video ref={video} playsInline muted aria-label="Live rear-camera preview" /><span /></div>
        <p role="status">{message}</p>
        <div className="scanner-actions">
          {torchAvailable && <button className="button button-secondary" type="button" onClick={toggleTorch}>{torchOn ? "Turn flashlight off" : "Turn flashlight on"}</button>}
          {!controls.current && !starting && <button className="button button-primary" type="button" onClick={() => start()}>Try camera again</button>}
          <button className="button button-secondary" type="button" onClick={stop}>Close scanner</button>
        </div>
      </div>
    </div>}
  </>;
}
