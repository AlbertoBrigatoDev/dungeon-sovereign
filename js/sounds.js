window.DS = window.DS || {};

DS.sounds = (function () {

    // Variazione di pitch casuale per evitare ripetitività
    const pitchVariance = (base, range) =>
        base + (Math.random() * range * 2 - range);

    // Crea un Howl con gestione errori silenziosa
    const safe = (src, opts = {}) => {
        try {
            return new Howl({
                src: Array.isArray(src) ? src : [src],
                volume: opts.volume ?? 0.6,
                rate: opts.rate ?? 1.0,
                onloaderror: () => {}   // silenzioso se file mancante
            });
        } catch (e) {
            return { play: () => {} };  // stub se Howler non disponibile
        }
    };

    const lib = {
        card_played:     safe('sounds/card_played.mp3',   { volume: 0.5 }),
        attack_hit:      safe('sounds/attack_hit.mp3',    { volume: 0.7 }),
        hero_damage:     safe('sounds/hero_damage.mp3',   { volume: 0.8 }),
        enemy_death:     safe('sounds/enemy_death.mp3',   { volume: 0.7 }),
        heal:            safe('sounds/heal.mp3',           { volume: 0.6 }),
        status_applied:  safe('sounds/status_applied.mp3',{ volume: 0.5 }),
        barrier_blocked: safe('sounds/barrier_blocked.mp3',{ volume: 0.6 }),
        room_reveal:     safe('sounds/room_reveal.mp3',   { volume: 0.7 }),
        boss_reveal:     safe('sounds/boss_reveal.mp3',   { volume: 0.9 }),
        combat_start:    safe('sounds/combat_start.mp3',  { volume: 0.7 }),
        victory:         safe('sounds/victory.mp3',        { volume: 0.8 }),
        defeat:          safe('sounds/defeat.mp3',         { volume: 0.8 }),
    };

    return {
        play: function (id, pitchRange) {
            const sound = lib[id];
            if (!sound) return;
            try {
                if (pitchRange) {
                    const s = sound.play();
                    sound.rate(pitchVariance(1.0, pitchRange), s);
                } else {
                    sound.play();
                }
            } catch (e) {}
        },

        stopAll: function () {
            try { Howler.stop(); } catch (e) {}
        },

        setVolume: function (v) {
            try { Howler.volume(v); } catch (e) {}
        }
    };
})();

DS.music = (function () {

    const FADE_MS = 1500;
    let _currentId = null;
    let _musicVolume = 0.35;

    // html5: true avvia la riproduzione prima del download completo
    const make = (src) => {
        try {
            return new Howl({
                src: [src],
                loop: true,
                volume: 0,
                html5: true,
                onloaderror: () => {}
            });
        } catch (e) {
            return { play: () => {}, stop: () => {},
                     fade: () => {}, volume: () => {},
                     playing: () => false };
        }
    };

    const tracks = {
        menu:           make('sounds/music_menu.mp3'),
        dungeon:        make('sounds/music_dungeon.mp3'),
        dungeon_forest: make('sounds/music_dungeon_forest.mp3'),
        combat:         make('sounds/music_combat.mp3'),
        boss:           make('sounds/music_boss.mp3'),
    };

    // Avvia in crossfade-in la traccia indicata.
    // Il fade parte dall'evento 'play': su audio html5 un fade chiamato
    // subito dopo play() non rampa (la riproduzione non è ancora attiva).
    const startTrack = (id) => {
        const next = tracks[id];
        if (!next) return;
        next.volume(0);
        next.once('play', () => {
            next.fade(0, _musicVolume, FADE_MS);
        });
        next.play();
    };

    // Le policy di autoplay bloccano l'audio html5 finché non c'è
    // un'interazione utente. Howler sblocca l'audio in modo asincrono
    // dopo il primo gesto, quindi la traccia desiderata viene (ri)avviata
    // sia subito sia poco dopo ogni gesto, finché non parte davvero.
    const ensurePlaying = () => {
        if (!_currentId) return;
        const t = tracks[_currentId];
        if (!t) return;
        if (!t.playing()) startTrack(_currentId);
        if (t.playing()) {
            document.removeEventListener('pointerdown', onGesture);
            document.removeEventListener('keydown', onGesture);
        }
    };
    const onGesture = () => {
        ensurePlaying();
        setTimeout(ensurePlaying, 400);
    };
    document.addEventListener('pointerdown', onGesture);
    document.addEventListener('keydown', onGesture);

    return {

        // Transita alla traccia indicata con crossfade.
        // Se la traccia è già in riproduzione, non fa nulla.
        play: function (id) {
            if (_currentId === id) return;

            // Fade out traccia corrente
            const prev = _currentId ? tracks[_currentId] : null;
            if (prev) {
                prev.fade(_musicVolume, 0, FADE_MS);
                setTimeout(() => prev.stop(), FADE_MS + 100);
            }

            // Fade in nuova traccia. Se l'audio non è ancora sbloccato dal
            // browser, play() fallisce silenziosamente e onGesture la riavvia.
            _currentId = id;
            startTrack(id);
        },

        // Ferma tutto con fade out
        stop: function () {
            if (!_currentId) return;
            const current = tracks[_currentId];
            if (current) {
                current.fade(_musicVolume, 0, FADE_MS);
                setTimeout(() => current.stop(), FADE_MS + 100);
            }
            _currentId = null;
        },

        // Volume musica indipendente da SFX (0.0 - 1.0)
        setVolume: function (v) {
            _musicVolume = v;
            if (_currentId && tracks[_currentId]) {
                tracks[_currentId].volume(v);
            }
        },

        currentTrack: function () { return _currentId; }
    };
})();

// Log di conferma
if (typeof Howler !== 'undefined') {
    console.log('DS.sounds: Howler.js caricato correttamente.');
} else {
    console.warn('DS.sounds: Howler.js non trovato.');
}
