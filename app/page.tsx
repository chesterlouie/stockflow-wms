import Link from "next/link";

const features = [
  ["01", "Warehouse operations", "Receive, put away, pick, pack, dispatch, return, transfer, and replenish stock."],
  ["02", "Phone barcode scanning", "Turn ordinary smartphones into warehouse scanners with a responsive mobile workflow."],
  ["03", "Inventory counts", "Run cycle, blind, physical, recount, and wall-to-wall counting programs."],
  ["04", "ERP-ready APIs", "Connect items, orders, receipts, balances, adjustments, and shipment confirmations."],
];

export default function Home() {
  return (
    <main className="marketing-page">
      <header className="public-nav container">
        <Link href="/" className="brand"><span className="brand-mark">W</span><span>Warevanta</span></Link>
        <nav aria-label="Public navigation">
          <a href="#features">Features</a>
          <a href="#about">How it works</a>
          <Link className="button button-secondary" href="/signin">Sign in</Link>
          <Link className="button button-primary" href="/signup">Start free</Link>
        </nav>
      </header>

      <section className="hero container">
        <div className="hero-copy">
          <div className="eyebrow">Warehouse control made simple</div>
          <h1>Know exactly what&apos;s in stock—and where.</h1>
          <p>A practical warehouse management system for growing businesses. Receive, track, pick, count, and report from any computer or smartphone.</p>
          <div className="hero-actions">
            <Link className="button button-primary button-large" href="/signup">Create your workspace</Link>
            <a className="text-link" href="#about">See how it works →</a>
          </div>
          <div className="trust-row"><span>✓ No credit card required</span><span>✓ Private company workspace</span><span>✓ Mobile scanning</span></div>
        </div>
        <div className="product-preview" aria-label="Generic Warevanta dashboard preview">
          <div className="preview-top"><span>Operations overview</span><span className="live-dot">● Live</span></div>
          <div className="preview-content">
            <div className="preview-metrics"><div><small>Stock items</small><strong>12.8k</strong></div><div><small>To pick</small><strong>42</strong></div><div><small>Accuracy</small><strong>99.1%</strong></div></div>
            <div className="preview-chart"><i style={{height:"42%"}}/><i style={{height:"64%"}}/><i style={{height:"51%"}}/><i style={{height:"83%"}}/><i style={{height:"71%"}}/><i style={{height:"46%"}}/></div>
            <div className="scan-ready"><span className="scan-icon">⌗</span><span><small>Mobile scanning</small><strong>Ready to scan</strong></span></div>
          </div>
        </div>
      </section>

      <section className="feature-section" id="features">
        <div className="container">
          <div className="section-heading" id="about"><div className="eyebrow">One connected inventory</div><h2>Everything your warehouse needs to move</h2><p>Start on your local network and move to the cloud as your business grows.</p></div>
          <div className="feature-grid">{features.map(([number,title,description]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
        </div>
      </section>
      <footer className="public-footer container"><span>© 2026 Warevanta</span><span>Private by design · Built for growing warehouses</span></footer>
    </main>
  );
}
