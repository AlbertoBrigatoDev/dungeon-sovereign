// Dungeon Sovereign — JS interop layer
// Namespace globale per evitare conflitti
window.DS = {

  // Animazione danno: flash rosso + numero flottante
  animateHpChange: function(stateId, delta, newValue) {
    const el = document.getElementById('hero-' + stateId)
             || document.getElementById('enemy-' + stateId);
    if (!el) return;

    if (delta < 0) {
      // Flash rosso sul pannello
      anime({
        targets: el,
        backgroundColor: ['rgba(180,30,30,0.4)', 'rgba(0,0,0,0)'],
        duration: 500,
        easing: 'easeOutCubic'
      });

      // Numero flottante
      const num = document.createElement('div');
      num.textContent = delta.toString();
      num.className = 'damage-number fixed text-xl z-[100] pointer-events-none';
      const rect = el.getBoundingClientRect();
      num.style.left = (rect.left + rect.width / 2) + 'px';
      num.style.top = (rect.top + 10) + 'px';
      document.body.appendChild(num);

      anime({
        targets: num,
        translateY: -60,
        opacity: [1, 0],
        duration: 900,
        easing: 'easeOutQuart',
        complete: () => num.remove()
      });

    } else if (delta > 0) {
      // Numero verde per cura
      const num = document.createElement('div');
      num.textContent = '+' + delta;
      num.className = 'heal-number fixed text-lg z-[100] pointer-events-none';
      const rect = el.getBoundingClientRect();
      num.style.left = (rect.left + rect.width / 2) + 'px';
      num.style.top = (rect.top + 10) + 'px';
      document.body.appendChild(num);

      anime({
        targets: num,
        translateY: -50,
        opacity: [1, 0],
        duration: 800,
        easing: 'easeOutQuart',
        complete: () => num.remove()
      });
    }
  },

  // Carta che si sposta dalla mano al campo / discard / out-of-run
  animateCardMove: function(instanceId, fromZone, toZone) {
    const cardEl = document.getElementById('card-' + instanceId);
    if (!cardEl) return;

    if (toZone === 'Discard' || toZone === 'OutOfRun') {
      anime({
        targets: cardEl,
        translateY: [0, -30],
        opacity: [1, 0],
        scale: [1, 0.8],
        duration: 400,
        easing: 'easeInCubic'
      });
    }
  },

  // PA recuperati / spesi
  animateApChange: function(stateId, newValue) {
    const apDots = document.querySelectorAll(
      '#hero-' + stateId + ' .ap-dot'
    );
    if (apDots.length === 0) return;
    anime({
      targets: apDots,
      scale: [1, 1.3, 1],
      duration: 300,
      delay: anime.stagger(50),
      easing: 'easeInOutQuad'
    });
  },

  // Status applicato: icona che appare
  animateStatusApplied: function(stateId, statusId) {
    const el = document.getElementById('hero-' + stateId)
             || document.getElementById('enemy-' + stateId);
    if (!el) return;

    const icon = document.createElement('div');
    icon.textContent = DS._statusIcon(statusId);
    icon.style.cssText = `
      position: fixed; font-size: 1.5rem; z-index: 100;
      pointer-events: none; user-select: none;
    `;
    const rect = el.getBoundingClientRect();
    icon.style.left = (rect.left + rect.width / 2 - 12) + 'px';
    icon.style.top = (rect.top - 10) + 'px';
    document.body.appendChild(icon);

    anime({
      targets: icon,
      translateY: [-20, -60],
      opacity: [1, 0],
      duration: 1000,
      easing: 'easeOutQuart',
      complete: () => icon.remove()
    });
  },

  // Annuncio cambio fase
  announcePhaseChange: function(phaseName) {
    const overlay = document.getElementById('phase-announce');
    if (!overlay) return;

    overlay.textContent = DS._phaseLabel(phaseName);
    anime({
      targets: overlay,
      opacity: [0, 1, 1, 0],
      translateY: [10, 0, 0, -10],
      duration: 1500,
      easing: 'easeInOutQuad'
    });
  },

  revealRoom: function(roomType) {
    const card = document.getElementById('room-reveal-card');
    if (!card) return;
    anime({
      targets: card,
      translateY: [40, 0],
      opacity: [0, 1],
      duration: 600,
      easing: 'easeOutCubic'
    });
  },

  // Auto-scroll di un container (usato dal CombatLog)
  scrollToBottom: function(element) {
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  },

  _statusIcon: function(statusId) {
    const icons = {
      'Poison': '☠', 'Bleed': '🩸', 'Frost': '❄',
      'Slow': '🐢', 'Sleep': '💤', 'Curse': '💀',
      'Inspiration': '✨', 'Weakness': '⬇'
    };
    return icons[statusId] || '?';
  },

  _phaseLabel: function(phase) {
    const labels = {
      'Setup': 'PREPARAZIONE',
      'CombatRoundStart': 'INIZIO ROUND',
      'UnitTurn': 'TURNO',
      'CombatRoundEnd': 'FINE ROUND',
      'RoomLoot': 'BOTTINO',
      'RoomCleanup': 'PULIZIA',
      'RunEnd': 'FINE RUN'
    };
    return labels[phase] || phase;
  }
};

// Verifica che Anime.js sia caricato correttamente
if (typeof anime === 'undefined') {
  console.error('DS: Anime.js non trovato. Verificare il CDN.');
} else {
  console.log('DS: animations.js caricato correttamente.');
}
