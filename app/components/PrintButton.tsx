'use client';
export default function PrintButton({label='Print label'}:{label?:string}){return <button className="button button-primary" type="button" onClick={()=>window.print()}>{label}</button>}
