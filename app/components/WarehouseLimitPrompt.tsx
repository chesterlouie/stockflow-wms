"use client";

import Link from "next/link";
import { useState } from "react";

export default function WarehouseLimitPrompt({ planName, warehouseLimit }: { planName: string; warehouseLimit: number }) {
  const [open, setOpen] = useState(false);
  const warehouseLabel = `${warehouseLimit} warehouse${warehouseLimit === 1 ? "" : "s"}`;

  return <>
    <button className="button button-primary" type="button" onClick={() => setOpen(true)}>Create warehouse</button>
    <p className="form-note">Your {planName} plan has reached its {warehouseLabel} limit.</p>
    {open && <div className="plan-limit-overlay" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="plan-limit-dialog" role="dialog" aria-modal="true" aria-labelledby="warehouse-limit-title" onMouseDown={(event) => event.stopPropagation()}>
        <span className="badge warn">Plan limit reached</span>
        <h2 id="warehouse-limit-title">Another warehouse requires a plan upgrade</h2>
        <p>Your <strong>{planName}</strong> plan allows {warehouseLabel}. Your existing warehouse and inventory are unaffected.</p>
        <div className="inline-actions">
          <Link className="button button-primary" href="/app/billing">Review upgrade options</Link>
          <button className="button button-secondary" type="button" onClick={() => setOpen(false)}>Close</button>
        </div>
      </section>
    </div>}
  </>;
}
