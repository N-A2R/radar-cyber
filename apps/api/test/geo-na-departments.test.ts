/** Department scope rules for Nouvelle-Aquitaine geocoding. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { naDepartmentCode, naDepartmentsIn } from "../src/geo/na-departments.js";

describe("Nouvelle-Aquitaine department scope", () => {
  it("maps INSEE codes and French department labels to the same code", () => {
    assert.equal(naDepartmentCode("33"), "33");
    assert.equal(naDepartmentCode(" 33 "), "33");
    assert.equal(naDepartmentCode("Gironde"), "33");
    assert.equal(naDepartmentCode("Pyrénées-Atlantiques"), "64");
    assert.equal(naDepartmentCode("Deux-Sèvres"), "79");
    assert.equal(naDepartmentCode("Haute-Vienne"), "87");
  });

  it("rejects missing, malformed and out-of-region departments", () => {
    for (const value of [null, undefined, "", "75", "Paris", "Nouvelle-Aquitaine", "972"]) {
      assert.equal(naDepartmentCode(value), null, `unexpected scope for ${String(value)}`);
    }
  });

  it("keeps each raw department value once when scoping database rows", () => {
    assert.deepEqual(
      naDepartmentsIn(["33", "Gironde", "75", "Charente-Maritime", "Paris", "Gironde"]),
      ["33", "Gironde", "Charente-Maritime"],
    );
  });
});
