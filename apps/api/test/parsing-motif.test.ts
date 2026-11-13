import { test } from "node:test";
import assert from "node:assert/strict";
import { classerMotifEchec } from "../src/collectors/generic.js";

test("HTML sans élément extractible -> selecteur", () => {
  assert.equal(classerMotifEchec({ itemsExtraits: 0, itemsRetenus: 0 }), "selecteur");
});

test("10 éléments extraits, 0 retenus -> filtre", () => {
  assert.equal(classerMotifEchec({ itemsExtraits: 10, itemsRetenus: 0 }), "filtre");
});

test("les deux ne sont pas confondus", () => {
  assert.notEqual(
    classerMotifEchec({ itemsExtraits: 0, itemsRetenus: 0 }),
    classerMotifEchec({ itemsExtraits: 10, itemsRetenus: 0 }),
  );
});
