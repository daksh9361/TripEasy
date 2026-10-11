import {X} from 'lucide-react';
export default function Modal({title,onClose,children}) {
 return <div className="backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header><div><small>TRIPEASY PREVIEW</small><h2 id="dialog-title">{title}</h2></div><button className="icon" aria-label="Close" onClick={onClose}><X size={18}/></button></header>{children}</section></div>;
}
