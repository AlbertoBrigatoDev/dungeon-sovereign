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
    // Blocco G — Reset del transform inline copiato dalla carta sorgente
    // (HandSlot fan layout). Senza questo il clone partirebbe spostato
    // del Slot.TranslateX/Y, dato che la sua position:fixed+left/top è
    // già la posizione visiva finale (startRect tiene già conto del
    // transform). Ripartiamo da identità per non sommare gli offset.
    clone.style.transform = 'none';
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
    // Blocco G — Reset del transform copiato dal HandSlot fan layout
    // (vedi nota nel cardFlight sopra).
    clone.style.transform = 'none';
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

  // Sessione 11 - Animazione d'ingresso della schermata di fine run.
  // Stagger fade-up dei pannelli statistiche, count-up dei numeri da 0,
  // type-on della frase di valutazione. Tutto DOM/Anime.js, indipendente
  // dal layer Pixi. No-op difensivo se gli elementi non esistono.
  animateRunEnd: function() {
    // Stagger fade-up dei pannelli.
    const panels = document.querySelectorAll('.ds-stat-panel');
    if (panels.length > 0) {
      anime({
        targets: panels,
        opacity: [0, 1],
        translateY: [16, 0],
        duration: 500,
        delay: anime.stagger(120, { start: 150 }),
        easing: 'easeOutCubic'
      });
    }

    // Count-up dei numeri da 0 al valore in data-target.
    const numbers = document.querySelectorAll('.ds-stat-number');
    numbers.forEach(function(el) {
      const target = parseInt(el.getAttribute('data-target') || '0', 10);
      if (isNaN(target) || target <= 0) {
        el.textContent = String(isNaN(target) ? 0 : target);
        return;
      }
      const counter = { v: 0 };
      anime({
        targets: counter,
        v: target,
        duration: 900,
        delay: 300,
        easing: 'easeOutCubic',
        round: 1,
        update: function() {
          el.textContent = String(counter.v);
        }
      });
    });

    // Type-on della frase di valutazione.
    const phraseEl = document.querySelector('.ds-eval-phrase');
    if (phraseEl) {
      const full = phraseEl.getAttribute('data-text') || phraseEl.textContent || '';
      phraseEl.textContent = '';
      let i = 0;
      const step = function() {
        if (i <= full.length) {
          phraseEl.textContent = full.slice(0, i);
          i++;
          setTimeout(step, 28);
        }
      };
      setTimeout(step, 700);
    }
  },

  // Blocco F (Tappa B.1) - Animazione cinematica della prova di stanza.
  // Selectors: '.ds-skillcheck-die' (numero D20, anima da scramble a finalRoll),
  //            '.ds-skillcheck-total' (totale finale, count-up da 0 a finalTotal),
  //            '.ds-skillcheck-banner' (banner SUCCESSO/FALLIMENTO, fade-in tardivo).
  // durationMs: durata della parte "rolling" del dado (default 1200).
  animateSkillCheck: function(finalRoll, finalTotal, durationMs) {
    const duration = (typeof durationMs === 'number' && durationMs > 0) ? durationMs : 1200;
    const dieEl = document.querySelector('.ds-skillcheck-die');
    const totalEl = document.querySelector('.ds-skillcheck-total');
    const bannerEl = document.querySelector('.ds-skillcheck-banner');

    // Scramble del dado: rimbalza tra 1 e 20 fino al 'duration', poi atterra sul valore reale.
    if (dieEl) {
      const scrambleSteps = Math.max(8, Math.floor(duration / 60));
      let i = 0;
      const step = function() {
        if (i < scrambleSteps) {
          // Numero pseudo-random 1-20.
          dieEl.textContent = String(1 + Math.floor(Math.random() * 20));
          i++;
          setTimeout(step, Math.floor(duration / scrambleSteps));
        } else {
          dieEl.textContent = String(finalRoll);
          // Piccolo "punch" finale.
          anime({
            targets: dieEl,
            scale: [1.0, 1.25, 1.0],
            duration: 380,
            easing: 'easeOutQuad'
          });
        }
      };
      step();
    }

    // Count-up del totale, parte a metà del rolling.
    if (totalEl) {
      const counter = { v: 0 };
      const startDelay = Math.max(0, Math.floor(duration * 0.45));
      anime({
        targets: counter,
        v: finalTotal,
        duration: Math.max(400, Math.floor(duration * 0.7)),
        delay: startDelay,
        easing: 'easeOutCubic',
        round: 1,
        update: function() {
          totalEl.textContent = String(counter.v);
        }
      });
    }

    // Banner: appare dopo che il dado si ferma.
    if (bannerEl) {
      bannerEl.style.opacity = '0';
      anime({
        targets: bannerEl,
        opacity: [0, 1],
        translateY: [10, 0],
        scale: [0.9, 1.0],
        duration: 460,
        delay: duration + 120,
        easing: 'easeOutBack'
      });
    }
  },

  // Blocco F (Tappa B.2) - Animazione overlay di inizio combattimento.
  // Stagger fade-in delle righe del roster (alleati a sinistra, nemici a
  // destra), titolo che entra dall'alto, card che pulsa leggermente.
  // No-op difensivo se gli elementi non esistono.
  animateCombatStart: function() {
    const card = document.querySelector('.ds-combat-start-card');
    if (card) {
      anime({
        targets: card,
        translateY: [40, 0],
        opacity: [0, 1],
        duration: 480,
        easing: 'easeOutCubic'
      });
    }

    const title = document.querySelector('.ds-combat-start-title');
    if (title) {
      anime({
        targets: title,
        scale: [0.9, 1.0],
        opacity: [0, 1],
        duration: 600,
        delay: 200,
        easing: 'easeOutBack'
      });
    }

    const rows = document.querySelectorAll('.ds-combat-start-row');
    if (rows.length > 0) {
      anime({
        targets: rows,
        translateX: function(el) {
          return el.closest('.ds-combat-start-enemies') ? [24, 0] : [-24, 0];
        },
        opacity: [0, 1],
        duration: 420,
        delay: anime.stagger(80, { start: 350 }),
        easing: 'easeOutCubic'
      });
    }
  },

  // Blocco F (Tappa B.3) - Animazione overlay di vittoria di stanza.
  // Titolo scale-in con punch, count-up dei numeri delle mini-stats,
  // card che entra dal basso. No confetti (riservati a RunEnd).
  animateCombatVictory: function() {
    const card = document.querySelector('.ds-combat-victory-card');
    if (card) {
      anime({
        targets: card,
        translateY: [50, 0],
        opacity: [0, 1],
        duration: 520,
        easing: 'easeOutCubic'
      });
    }

    const title = document.querySelector('.ds-combat-victory-title');
    if (title) {
      anime({
        targets: title,
        scale: [0.85, 1.05, 1.0],
        opacity: [0, 1],
        duration: 720,
        delay: 200,
        easing: 'easeOutBack'
      });
    }

    const eyebrow = document.querySelector('.ds-combat-victory-eyebrow');
    if (eyebrow) {
      anime({
        targets: eyebrow,
        opacity: [0, 1],
        translateY: [-10, 0],
        duration: 400,
        delay: 100,
        easing: 'easeOutCubic'
      });
    }

    // Count-up delle mini-stats (round, kills).
    const stats = document.querySelectorAll('.ds-combat-victory-rounds, .ds-combat-victory-kills');
    stats.forEach(function(el) {
      const target = parseInt(el.getAttribute('data-target') || '0', 10);
      if (isNaN(target) || target <= 0) {
        el.textContent = String(isNaN(target) ? 0 : target);
        return;
      }
      const counter = { v: 0 };
      anime({
        targets: counter,
        v: target,
        duration: 700,
        delay: 600,
        easing: 'easeOutCubic',
        round: 1,
        update: function() {
          el.textContent = String(counter.v);
        }
      });
    });
  },

  // Blocco F (Tappa C) - Animazione overlay di "viaggio nel dungeon".
  // Card che entra dal basso, nodi pop in cascata, nodo corrente con flash.
  animateDungeonMapReveal: function() {
    const card = document.querySelector('.ds-dungeon-map-reveal-card');
    if (card) {
      anime({
        targets: card,
        translateY: [30, 0],
        opacity: [0, 1],
        duration: 500,
        easing: 'easeOutCubic'
      });
    }

    const nodes = document.querySelectorAll('.ds-dungeon-map-reveal .ds-dungeon-map-node');
    if (nodes.length > 0) {
      anime({
        targets: nodes,
        scale: [0.5, 1.0],
        opacity: [0, 1],
        duration: 320,
        delay: anime.stagger(45, { start: 220 }),
        easing: 'easeOutBack'
      });
    }

    // Nodo corrente: flash di evidenziazione.
    const current = document.querySelector('.ds-dungeon-map-reveal .ds-dungeon-map-node[data-status="current"] .ds-dungeon-map-circle');
    if (current) {
      anime({
        targets: current,
        scale: [1.0, 1.25, 1.0],
        duration: 720,
        delay: 220 + nodes.length * 45 + 120,
        easing: 'easeOutQuad'
      });
    }
  },

  // Annuncio cambio fase — overlay "PREPARAZIONE" / "TURNO" / ecc. che
  // compare in alto al centro. Durata totale 4.5 s (era 1.5 s): i 3 s
  // aggiuntivi sono inseriti nel segmento di "hold" così il fade-in e
  // il fade-out restano ritmati come prima e l'effetto non sembra "lento".
  announcePhaseChange: function(phaseName) {
    const overlay = document.getElementById('phase-announce');
    if (!overlay) return;

    overlay.textContent = DS._phaseLabel(phaseName);
    anime({
      targets: overlay,
      keyframes: [
        { opacity: 1, translateY: 0,   duration: 375 },  // fade-in
        { opacity: 1, translateY: 0,   duration: 3750 }, // hold (era 750 ms)
        { opacity: 0, translateY: -10, duration: 375 }   // fade-out
      ],
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
  },

  // Blocco G (Tappa G.4) - Slide-in al pescaggio di una nuova carta.
  // La carta parte off-screen a destra (simulando il mazzo), ruotata,
  // e raggiunge il suo slot finale nel ventaglio con easeOutBack.
  //
  // IMPORTANTE: Anime.js NON supporta tween di `transform` come stringa
  // unica ("translate(...) rotate(...)"). Va animato per componenti
  // separate (translateX, translateY, rotate, scale). Il C# passa
  // direttamente i valori finali calcolati da HandSlot.
  //
  // Parametri:
  //   cardElId  = id DOM della carta (es. 'card-{instanceId}')
  //   endX/Y    = transform finale lungo X/Y (px)
  //   endRot    = rotazione finale (gradi)
  //   endScale  = scala finale
  //   durationMs = durata animazione, default 460
  //   delayMs   = ritardo iniziale (per stagger sul mulligan), default 0
  animateCardDrawIn: function(cardElId, endX, endY, endRot, endScale, durationMs, delayMs) {
    const el = document.getElementById(cardElId);
    if (!el) return;
    // Rispetta il toggle FX: se disabilitato, niente animazione.
    if (window.DS && DS.fx && DS.fx.enabled === false) return;

    // Stato iniziale "off-screen destra, ruotata in giù" via anime.set
    // così Anime.js registra i valori delle proprietà separate; poi
    // tween fino ai valori finali ricevuti dal C#.
    anime.set(el, {
      translateX: 900,
      translateY: -30,
      rotate: 35,
      scale: 0.85
    });

    anime({
      targets: el,
      translateX: endX,
      translateY: endY,
      rotate: endRot,
      scale: endScale,
      duration: (typeof durationMs === 'number' && durationMs > 0) ? durationMs : 460,
      delay: (typeof delayMs === 'number' && delayMs >= 0) ? delayMs : 0,
      easing: 'easeOutBack'
    });
  },

  // Blocco G (Tappa G.3) - Posiziona il tooltip ANCORATO sopra un elemento
  // DOM (centrato orizzontalmente, con margine). Se non c'è spazio sopra,
  // ribalta sotto. Pattern Hearthstone-like: il tooltip non segue il
  // cursore, resta fermo sopra la carta finché si esce dall'area.
  //
  // Parametri:
  //   tooltipEl   = ElementReference al div radice del tooltip
  //   anchorElId  = id DOM dell'elemento di ancoraggio (es. 'card-{instanceId}')
  //   margin      = spazio fra l'ancora e il tooltip (default 12 px)
  //
  // Effetti: style.left / style.top / style.visibility sul tooltip.
  positionTooltipAboveAnchor: function(tooltipEl, anchorElId, margin) {
    if (!tooltipEl) return;
    const m = (typeof margin === 'number' && margin >= 0) ? margin : 12;
    const safeMargin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const anchorEl = document.getElementById(anchorElId);
    if (!anchorEl) {
      // Fallback: centro viewport in alto. Niente flash di tooltip in (0,0).
      const tRect = tooltipEl.getBoundingClientRect();
      tooltipEl.style.left = Math.max(safeMargin, (vw - tRect.width) / 2) + 'px';
      tooltipEl.style.top = safeMargin + 'px';
      tooltipEl.style.visibility = 'visible';
      return;
    }

    const aRect = anchorEl.getBoundingClientRect();
    const tRect = tooltipEl.getBoundingClientRect();

    // Centrato orizzontalmente rispetto all'ancora.
    let left = aRect.left + (aRect.width - tRect.width) / 2;
    // Default: sopra l'ancora con margine.
    let top = aRect.top - tRect.height - m;

    // Flip verticale: se sfora in alto, ribalta sotto.
    if (top < safeMargin) {
      const below = aRect.bottom + m;
      if (below + tRect.height <= vh - safeMargin) {
        top = below;
      } else {
        // Non sta né sopra né sotto: prendi il meno peggio (in alto, clamp).
        top = Math.max(safeMargin, vh - tRect.height - safeMargin);
      }
    }

    // Clamp orizzontale al viewport.
    if (left + tRect.width + safeMargin > vw) {
      left = vw - tRect.width - safeMargin;
    }
    if (left < safeMargin) {
      left = safeMargin;
    }

    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
    tooltipEl.style.visibility = 'visible';
  }
};

// Verifica che Anime.js sia caricato correttamente
if (typeof anime === 'undefined') {
  console.error('DS: Anime.js non trovato. Verificare il CDN.');
} else {
  console.log('DS: animations.js caricato correttamente.');
}
