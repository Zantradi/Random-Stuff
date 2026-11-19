Alchemical Hydrix & Onyx Calculators (RuneScape 3)
===================================================

Open:   double-click "Alchemical Hydrix Calculator" or "Alchemical Onyx Calculator" on the desktop
        (or run ./start.sh [onyx.html] — serves http://127.0.0.1:8642/ and opens it).
        Opening index.html (hydrix) or onyx.html directly also works.
        The Hydrix | Onyx switch in the header jumps between them; Invention level,
        junk research and the volume filter are shared, everything else is per calculator.
Stop:   ./stop.sh

Offline: recipes, disassembly rates, 800+ item images and a price snapshot are all local.
         Each time the page opens it pulls fresh GE prices, buy limits and volumes from the
         RuneScape Wiki and saves them; if you're offline it uses the last saved prices.

Update dataset (new items / wiki changes, optional): ./tools/update_data.sh
