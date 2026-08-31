"use client";

import Link from "next/link";
import { useState } from "react";

export default function UserLimitPrompt({ planName, used, limit, pending }: { planName: string; used: number; limit: number; pending: number }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="button button-primary" type="button" onClick={() => setOpen(true)}>Send invitation</button>
    <p className="form-note">{used} of {limit} user slots are reserved{pending ? `, including ${pending} pending invitation${pending === 1 ? "" : "s"}` : ""}.</p>
    {open && <div className="plan-limit-overlay" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="plan-limit-dialog" role="dialog" aria-modal="true" aria-labelledby="user-limit-title" onMouseDown={(event) => event.stopPropagation()}>
        <span className="badge warn">Plan limit reached</span>
        <h2 id="user-limit-title">Another user requires a plan upgrade</h2>
        <p>Your <strong>{planName}</strong> plan has used all <strong>{limit}</strong> user slots. Active users and unexpired pending invitations both reserve a slot.</p>
        <p>You may revoke an unused pending invitation to release its slot, or upgrade the subscription for additional users.</p>
        <div className="inline-actions"><Link className="button button-primary" href="/app/billing">Review upgrade options</Link><button className="button button-secondary" type="button" onClick={() => setOpen(false)}>Close</button></div>
      </section>
    </div>}
  </>;
}
