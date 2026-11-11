import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CON_PAPELERA, idPapelera } from "./papelera.js";

describe("papelera", () => {
  it("cada colección con papelera exige la copia en firestore.rules, y viceversa", () => {
    const reglas = readFileSync(new URL("./firestore.rules", import.meta.url), "utf8");
    const enReglas = [...reglas.matchAll(/conCopia\('([A-Za-z]+)'/g)].map(m => m[1]).sort();
    expect(enReglas).toEqual([...CON_PAPELERA].sort());
  });
  it("el id de la copia es coleccion__id", () => {
    expect(idPapelera("viaticos", "abc")).toBe("viaticos__abc");
  });
});
