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

  // Sessione 6 - Volo della carta giocata dalla mano al centro del campo.
  // Clona il nodo #card-{instanceId} (la card originale viene rimossa dal
  // DOM dal re-render Blazor subito dopo): il clone vola indipendente e si
  // autodistrugge a fine animazione. typeKey colora la scia Pixi.
  cardFlight: function(instanceId, typeKey) {
    const cardEl = document.getElementById('card-' + instanceId);
    if (!cardEl) return;

    const startRect = cardEl.getBoundingClientRect();
    if (startRect.width === 0 || startRect.height === 0) return;

    // Destinazione: centro del BattlefieldPanel, o centro viewport.
    const field = document.getElementById('ds-battlefield');
    let destX, destY;
    if (field) {
      const fr = field.getBoundingClientRect();
      destX = fr.left + fr.width / 2;
      destY = fr.top + fr.height / 2;
    } else {
      destX = window.innerWidth / 2;
      destY = window.innerHeight / 2;
    }

    // Clone visivo indipendente dall'albero Blazor.
    const clone = cardEl.cloneNode(true);
    clone.removeAttribute('id');
    clone.style.position = 'fixed';
    clone.style.left = startRect.left + 'px';
    clone.style.top = startRect.top + 'px';
    clone.style.width = startRect.width + 'px';
    clone.style.height = startRect.height + 'px';
    clone.style.margin = '0';
    clone.style.zIndex = '45';
    clone.style.pointerEvents = 'none';
    document.body.appendChild(clone);

    const deltaX = destX - (startRect.left + startRect.width / 2);
    const deltaY = destY - (startRect.top + startRect.height / 2);

    const trail = (window.DS && DS.fx && DS.fx.cardTrail) ? DS.fx.cardTrail : null;

    anime({
      targets: clone,
      translateX: deltaX,
      translateY: deltaY,
      scale: [1, 0.5],
      rotate: [0, 8],
      opacity: [1, 0],
      duration: 520,
      easing: 'easeInCubic',
      begin: function() {
        if (trail) trail.start(typeKey);
      },
      update: function() {
        if (!trail) return;
        const r = clone.getBoundingClientRect();
        trail.move(r.left + r.width / 2, r.top + r.height / 2);
      },
      complete: function() {
        if (trail) trail.stop();
        clone.remove();
      }
    });
  },

  // Sessione 10 - Volo di una carta equipaggiamento verso il suo slot.
  // Variante di cardFlight con destinazione esplicita (un id slot del
  // pannello eroe). Al termine spawna la scintilla d'arrivo Pixi.
  // category: 'weapon' | 'armor' | 'trinket' -> colore della scintilla.
  equipFlight: function(instanceId, slotElId, category) {
    const cardEl = document.getElementById('card-' + instanceId);
    const slotEl = document.getElementById(slotElId);
    if (!cardEl || !slotEl) return;

    const startRect = cardEl.getBoundingClientRect();
    if (startRect.width === 0 || startRect.height === 0) return;

    const slotRect = slotEl.getBoundingClientRect();
    const destX = slotRect.left + slotRect.width / 2;
    const destY = slotRect.top + slotRect.height / 2;

    const clone = cardEl.cloneNode(true);
    clone.removeAttribute('id');
    clone.style.position = 'fixed';
    clone.style.left = startRect.left + 'px';
    clone.style.top = startRect.top + 'px';
    clone.style.width = startRect.width + 'px';
    clone.style.height = startRect.height + 'px';
    clone.style.margin = '0';
    clone.style.zIndex = '45';
    clone.style.pointerEvents = 'none';
    document.body.appendChild(clone);

    const deltaX = destX - (startRect.left + startRect.width / 2);
    const deltaY = destY - (startRect.top + startRect.height / 2);

    anime({
      targets: clone,
      translateX: deltaX,
      translateY: deltaY,
      scale: [1, 0.18],
      opacity: [1, 0],
      duration: 480,
      easing: 'easeInCubic',
      complete: function() {
        clone.remove();
        if (window.DS && DS.fx && DS.fx.equipImpact) {
          DS.fx.equipImpact(slotElId, category);
        }
      }
    });
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

  // Sessione 3 PixiJS - applica lo shake CSS al DOM target.
  // strength: 'light' (250 ms) | 'strong' (400 ms). Cerca id stabili
  // 'hero-XXX' | 'enemy-XXX' | 'companion-XXX' (vedi spec-frontend §6).
  // Idempotente: rimuove la classe prima di riapplicarla (force reflow)
  // cosi che hit successivi vicini ripartano l'animazione.
  applyShake: function(stateId, strength) {
    if (!stateId) return;
    const el = document.getElementById('hero-' + stateId)
            || document.getElementById('enemy-' + stateId)
            || document.getElementById('companion-' + stateId);
    if (!el) return;
    const cls = strength === 'strong' ? 'shake-strong' : 'shake-light';
    const duration = strength === 'strong' ? 400 : 250;
    el.classList.remove('shake-light');
    el.classList.remove('shake-strong');
    // Force reflow per riavviare l'animazione anche se applicata di seguito.
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () {
      el.classList.remove(cls);
    }, duration);
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
  },

  // Posiziona un tooltip flottante (es. CardTooltip) accanto al cursore,
  // flippando verticalmente/orizzontalmente se sforerebbe il viewport.
  // Chiamato da OnAfterRenderAsync di CardTooltip — vedi spec-frontend §6.
  //
  // Parametri:
  //   el       = ElementReference al div radice del tooltip
  //   clientX  = coordinata X del cursore (viewport-relative)
  //   clientY  = coordinata Y del cursore (viewport-relative)
  //
  // Effetti: scrive style.left / style.top / style.visibility sull'elemento.
  clampTooltipPosition: function(el, clientX, clientY) {
    if (!el) return;
    const offsetX = 24;
    const offsetY = 16;
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = el.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // Default: a destra e sotto il cursore.
    let left = clientX + offsetX;
    let top = clientY + offsetY;

    // Flip orizzontale se sfora a destra; clamp ulteriore se anche il flip
    // sfora a sinistra (tooltip piu' largo del viewport meno offset).
    if (left + w + margin > vw) {
      left = clientX - w - offsetX;
      if (left < margin) {
        left = Math.max(margin, vw - w - margin);
      }
    }

    // Flip verticale se sfora in basso; clamp se anche il flip sfora in alto.
    // Tooltip piu' alti del viewport sono gestiti dal max-height + overflow
    // del componente.
    if (top + h + margin > vh) {
      top = clientY - h - offsetY;
      if (top < margin) {
        top = margin;
      }
    }

    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.visibility = 'visible';
  }
};

// Verifica che Anime.js sia caricato correttamente
if (typeof anime === 'undefined') {
  console.error('DS: Anime.js non trovato. Verificare il CDN.');
} else {
  console.log('DS: animations.js caricato correttamente.');
}
