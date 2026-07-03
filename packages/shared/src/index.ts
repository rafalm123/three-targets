// @trzy-cele/shared — kontrakty API współdzielone FE↔BE.
//
// Wzorzec (jedno źródło prawdy): każdy kontrakt = schemat zod (walidacja w runtime
// na granicy systemu) + wyinferowany typ (`z.infer`). Zmiana kontraktu w JEDNYM
// miejscu propaguje się do frontendu i backendu — to realizacja end-to-end type safety.
//
// Kolejne kontrakty (auth, dzień, cele) dochodzą przy swoich taskach (BE-4, BE-9/10…).
export * from './health';
