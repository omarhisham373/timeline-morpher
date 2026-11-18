import type { Project } from "./types";

/**
 * Demo project: a two-storey medical office shell. Durations are realistic
 * enough that slack, parallel trades and a clear critical path all show up.
 */
export const SAMPLE_PROJECT: Project = {
  id: "riverside-mob",
  name: "Riverside Medical Office · Phase 1",
  startDate: "2026-11-23",
  tasks: [
    { id: "excavation", name: "Excavation", trade: "Earthwork", aliases: ["dig", "digging", "excavator", "site prep", "grading"], durationDays: 3, dependsOn: [], delayDays: 0 },
    { id: "footings", name: "Footings & foundation", trade: "Concrete", aliases: ["footing", "foundation", "foundations", "forms", "formwork"], durationDays: 3, dependsOn: [{ taskId: "excavation", lagDays: 0 }], delayDays: 0 },
    { id: "rebar", name: "Slab rebar", trade: "Rebar", aliases: ["rebar", "reinforcing", "reinforcement", "steel mesh", "rebar delivery"], durationDays: 2, dependsOn: [{ taskId: "footings", lagDays: 0 }], delayDays: 0 },
    { id: "slab", name: "Slab pour · Area B", trade: "Concrete", aliases: ["slab", "pour", "concrete", "area b", "the pour"], durationDays: 1, dependsOn: [{ taskId: "rebar", lagDays: 0 }], delayDays: 0 },
    { id: "framing", name: "Steel framing", trade: "Steel", aliases: ["framing", "steel", "erection", "ironworkers", "frame", "structural steel"], durationDays: 5, dependsOn: [{ taskId: "slab", lagDays: 1 }], delayDays: 0 },
    { id: "roofing", name: "Roofing", trade: "Roofing", aliases: ["roof", "roofers", "membrane", "roofing crew"], durationDays: 3, dependsOn: [{ taskId: "framing", lagDays: 0 }], delayDays: 0 },
    { id: "hvac", name: "HVAC ductwork", trade: "Mechanical", aliases: ["hvac", "ductwork", "ducts", "duct", "mechanical", "air handler"], durationDays: 2, dependsOn: [{ taskId: "framing", lagDays: 0 }], delayDays: 0 },
    { id: "plumbing", name: "Plumbing rough-in", trade: "Plumbing", aliases: ["plumbing", "plumber", "plumbers", "pipes", "piping"], durationDays: 3, dependsOn: [{ taskId: "framing", lagDays: 0 }], delayDays: 0 },
    { id: "electrical", name: "Electrical rough-in", trade: "Electrical", aliases: ["electrical", "electrician", "electricians", "sparky", "sparkies", "wiring", "conduit"], durationDays: 3, dependsOn: [{ taskId: "framing", lagDays: 0 }], delayDays: 0 },
    { id: "inspection", name: "MEP inspection", trade: "Inspection", aliases: ["inspection", "inspector", "sign off", "signoff", "city inspection"], durationDays: 1, dependsOn: [{ taskId: "plumbing", lagDays: 0 }, { taskId: "electrical", lagDays: 0 }, { taskId: "hvac", lagDays: 0 }], delayDays: 0 },
    { id: "drywall", name: "Drywall", trade: "Drywall", aliases: ["drywall", "dry wall", "sheetrock", "board", "tapers", "gypsum"], durationDays: 4, dependsOn: [{ taskId: "inspection", lagDays: 0 }, { taskId: "roofing", lagDays: 0 }], delayDays: 0 },
    { id: "finishes", name: "Paint & finishes", trade: "Finishes", aliases: ["paint", "painting", "painters", "finishes", "finish work"], durationDays: 3, dependsOn: [{ taskId: "drywall", lagDays: 0 }], delayDays: 0 },
  ],
};
