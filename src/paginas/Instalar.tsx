import { useState } from 'react';
import { Download, MoreVertical, PlusSquare, Share, CheckCircle2 } from 'lucide-react';
import { Modal } from '../ui/ui';
import { useInstalar } from '../lib/pwa';

const NOMBRE = document.body.dataset.nombre || 'la aplicación';

// Android: botón directo cuando el navegador lo permite. iPhone: Apple exige hacerlo a mano desde Compartir.
export default function Instalar() {
  const [abierto, setA] = useState(true);
  const { disponible, instalada, ios, instalar } = useInstalar();
  if (!abierto) return null;
  return (
    <Modal titulo={`Instalar ${NOMBRE}`} cerrar={() => setA(false)}>
      <div className="pila">
        {instalada ? (
          <div className="aviso ok"><CheckCircle2 size={18} /><span>Ya estás usando la aplicación instalada.</span></div>
        ) : ios ? (
          <ol className="instalar-pasos">
            <li><i>1</i><span>Abre esta página en <b>Safari</b> o tu navegador principal.</span></li>
            <li><i>2</i><span>Toca <b>Compartir</b> <Share size={17} style={{ verticalAlign: -3 }} /> en la barra del navegador.</span></li>
            <li><i>3</i><span>Elige <b>Agregar a inicio</b> <PlusSquare size={17} style={{ verticalAlign: -3 }} />.</span></li>
            <li><i>4</i><span>Confirma con <b>Agregar</b>. La app aparecerá en tu pantalla de inicio.</span></li>
          </ol>
        ) : disponible ? (
          <>
            <p style={{ margin: 0 }}>Instálala en tu celular para abrirla como cualquier otra aplicación y recibir avisos.</p>
            <button className="boton prim ancho-total" onClick={async () => { if (await instalar()) setA(false); }}><Download size={18} />Instalar ahora</button>
          </>
        ) : (
          <ol className="instalar-pasos">
            <li><i>1</i><span>Abre esta página en <b>Chrome</b>.</span></li>
            <li><i>2</i><span>Toca el menú <MoreVertical size={17} style={{ verticalAlign: -3 }} /> arriba a la derecha.</span></li>
            <li><i>3</i><span>Elige <b>Instalar aplicación</b> o <b>Agregar a la pantalla principal</b>.</span></li>
          </ol>
        )}
        <button className="boton ancho-total" onClick={() => setA(false)}>{instalada ? 'Cerrar' : 'Ahora no'}</button>
      </div>
    </Modal>
  );
}
