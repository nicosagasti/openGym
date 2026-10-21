# TODO

Ideas y pendientes para este fork de openGym.

## Hecho
- [x] Rendimiento: la pantalla de entrenamiento ya no se vuelve a dibujar entera cada segundo
      durante el descanso (`frontend/src/views/Workout.jsx`).
- [x] Color de acento "Dinámico": rojo → verde según las series hechas hoy, verde si ya
      entrenaste, azul en día de descanso (`frontend/src/lib/dynamic-accent.js`).

## Ideas
- [ ] Live Activities / Dynamic Island con el temporizador de descanso. Solo es posible en la
      app nativa de iOS (ActivityKit, Swift): necesita una Mac con Xcode.
- [ ] Proponer el arreglo de rendimiento al proyecto original.

## Arreglos técnicos
- [ ] `src/lib/rest-alert.native.test.js` falla a veces por tiempo de espera al correr toda la
      suite (también en el código original).
- [ ] Dos tests fallan en Windows también sin cambios: `src/sheets.day-note.test.jsx` y
      `scripts/check-mobile-bundle.test.mjs`.
