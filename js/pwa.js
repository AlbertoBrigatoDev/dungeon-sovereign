// PWA: registrazione del service worker e notifica di aggiornamento disponibile.
// Espone window.DS.pwa con:
//   - init(dotNetRef): registra il SW e, quando un nuovo worker passa a stato
//     "installed" mentre uno e' gia' attivo, invoca dotNetRef.OnUpdateReady().
//   - applyUpdate(): manda SKIP_WAITING al worker in attesa e ricarica la pagina
//     non appena il nuovo worker prende il controllo.

(function () {
    window.DS = window.DS || {};

    let _registration = null;
    let _dotNetRef = null;
    let _updateNotified = false;

    function notifyUpdate() {
        if (_updateNotified || !_dotNetRef) return;
        _updateNotified = true;
        try {
            _dotNetRef.invokeMethodAsync('OnUpdateReady');
        } catch (e) {
            // Componente non disponibile (es. prerender): ignora.
        }
    }

    function trackInstallingWorker(worker) {
        if (!worker) return;
        worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                // Una versione precedente del SW e' gia' attiva: la nuova e' un update.
                notifyUpdate();
            }
        });
    }

    async function register() {
        if (!('serviceWorker' in navigator)) return;
        try {
            const reg = await navigator.serviceWorker.register('service-worker.js');
            _registration = reg;

            if (reg.waiting && navigator.serviceWorker.controller) {
                notifyUpdate();
            }

            if (reg.installing) {
                trackInstallingWorker(reg.installing);
            }

            reg.addEventListener('updatefound', () => {
                trackInstallingWorker(reg.installing);
            });

            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (refreshing) return;
                refreshing = true;
                window.location.reload();
            });
        } catch (e) {
            console.warn('Service worker registration failed:', e);
        }
    }

    window.DS.pwa = {
        init: function (dotNetRef) {
            _dotNetRef = dotNetRef;
            return register();
        },
        applyUpdate: function () {
            if (_registration && _registration.waiting) {
                _registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            } else {
                window.location.reload();
            }
        }
    };
})();
