import { setMinorModsCap} from "./state.js";
import {
    buildTickMarks,
    buildSliders,
    buildAugmentationUI,
    buildFragmentsUI,
    createCustomExoticUI,
    buildNewArchetypeToggleUI,
    minorModsSelect,
} from "./ui.parts.js";import { render } from "./ui.render.js";

import { inject } from "@vercel/analytics"

inject();

buildTickMarks();
buildSliders();
buildNewArchetypeToggleUI();
buildAugmentationUI();
buildFragmentsUI();
createCustomExoticUI();

if (minorModsSelect) {
    minorModsSelect.addEventListener("change", (e) => {
        setMinorModsCap(e.target.value);
        render();
    });
}

render();
