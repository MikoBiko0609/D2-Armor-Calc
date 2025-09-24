import { setMinorModsCap} from "./state.js";
import {buildTickMarks, buildSliders, buildAugmentationUI, buildFragmentsUI, createCustomExoticUI, minorModsSelect,} from "./ui.parts.js";
import { render } from "./ui.render.js";

buildTickMarks();
buildSliders();
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
