// Sector definitions: each sector groups "picks-and-shovels" companies.
// Tickers chosen so the user can invest where institutional/government money is flowing.
// Edit this file to add/remove sectors or tickers.

export const SECTORS = {
  "critical-minerals": {
    name: "Critical Minerals",
    color: "#7d5fff",
    description:
      "Miners and processors of lithium, cobalt, nickel, rare earths, copper, graphite — the picks-and-shovels behind EVs, defense and grid buildout.",
    tickers: [
      "ALB",   // Albemarle — lithium
      "SQM",   // Sociedad Quimica y Minera — lithium
      "MP",    // MP Materials — rare earths (Mountain Pass)
      "LYSDY", // Lynas — rare earths (ex-China)
      "FCX",   // Freeport-McMoRan — copper / gold
      "VALE",  // Vale — iron / nickel / copper
      "GLNCY", // Glencore — diversified miner / cobalt
      "CMCLF", // CMOC Group — cobalt / copper
      "LAC",   // Lithium Americas — lithium
      "PLL",   // Piedmont Lithium — lithium (US)
    ],
  },
  defense: {
    name: "Defense & War",
    color: "#ff4d4d",
    description:
      "Prime contractors riding rising defense budgets, Hormuz tensions, and the multi-year rebuild of NATO ammunition stockpiles.",
    tickers: [
      "LMT",   // Lockheed Martin
      "NOC",   // Northrop Grumman
      "RTX",   // RTX (Raytheon)
      "GD",    // General Dynamics
      "LHX",   // L3Harris
      "HII",   // Huntington Ingalls — naval
      "BA",    // Boeing — defense + commercial
      "LDOS",  // Leidos — defense IT
      "KTOS",  // Kratos — drones
    ],
  },
  nuclear: {
    name: "Nuclear & Uranium",
    color: "#2ee07a",
    description:
      "Uranium miners, enrichers and SMR builders. Powering the AI data-center buildout the grid otherwise can't supply.",
    tickers: [
      "CCJ",   // Cameco — uranium
      "UEC",   // Uranium Energy Corp
      "UUUU",  // Energy Fuels
      "NXE",   // NexGen Energy
      "DNN",   // Denison Mines
      "OKLO",  // Oklo — SMR
      "SMR",   // NuScale Power — SMR
      "BWXT",  // BWX Technologies — naval reactors
      "LEU",   // Centrus Energy — enrichment
    ],
  },
  "ai-infra": {
    name: "AI Infrastructure",
    color: "#5b8cff",
    description:
      "Chips, networking, power and cooling — the picks-and-shovels behind every AI build-out announced this quarter.",
    tickers: [
      "NVDA",  // Nvidia
      "AMD",   // AMD
      "AVGO",  // Broadcom — networking + custom silicon
      "TSM",   // TSMC
      "ASML",  // ASML — lithography
      "ARM",   // ARM Holdings
      "MU",    // Micron — HBM
      "ANET",  // Arista Networks
      "VRT",   // Vertiv — DC cooling/power
      "SMCI",  // Super Micro
    ],
  },
  energy: {
    name: "Energy",
    color: "#ffa44d",
    description:
      "Integrated majors, US shale and LNG exporters. Beneficiaries of Hormuz disruption and structural underinvestment.",
    tickers: [
      "XOM",   // ExxonMobil
      "CVX",   // Chevron
      "OXY",   // Occidental
      "COP",   // ConocoPhillips
      "EOG",   // EOG Resources
      "SLB",   // SLB (Schlumberger)
      "MPC",   // Marathon Petroleum
      "LNG",   // Cheniere — LNG export
      "FANG",  // Diamondback Energy
    ],
  },
  cyber: {
    name: "Cybersecurity",
    color: "#ff7ad9",
    description:
      "Pure-play security platforms — beneficiaries of mandatory federal spend (CISA, DoD) and rising state-actor threats.",
    tickers: [
      "CRWD",  // CrowdStrike
      "PANW",  // Palo Alto Networks
      "ZS",    // Zscaler
      "NET",   // Cloudflare
      "S",     // SentinelOne
      "OKTA",  // Okta
      "FTNT",  // Fortinet
    ],
  },
  semiconductors: {
    name: "Semiconductors",
    color: "#36c5ff",
    description:
      "Foundries, equipment, designers, memory and analog — every chip in every device, from AI training racks to autos to defense. Wider lens than AI Infrastructure: includes equipment and analog names that benefit regardless of AI capex cycle.",
    tickers: [
      "TSM",   // TSMC — leading foundry
      "ASML",  // ASML — EUV lithography monopoly
      "NVDA",  // Nvidia — AI compute
      "AMD",   // AMD — AI / CPU
      "AVGO",  // Broadcom — networking + custom silicon
      "ARM",   // Arm Holdings — IP licensor
      "INTC",  // Intel — foundry pivot, x86
      "MU",    // Micron — memory / HBM
      "AMAT",  // Applied Materials — equipment
      "LRCX",  // Lam Research — etch / deposition
      "KLAC",  // KLA — process control / metrology
      "TXN",   // Texas Instruments — analog leader
    ],
  },
  drones: {
    name: "Drones & Autonomous",
    color: "#ff8c42",
    description:
      "Drones, loitering munitions and autonomous systems plus the suppliers building them. Pentagon Replicator program and Ukraine/Hormuz battlefield lessons accelerated procurement; the buildout is multi-year.",
    tickers: [
      "KTOS",  // Kratos — XQ-58 Valkyrie, target drones
      "AVAV",  // AeroVironment — Switchblade, Puma
      "RKLB",  // Rocket Lab — rockets + defense systems
      "ONDS",  // Ondas — small UAVs / autonomous
      "TXT",   // Textron — Bell drones, Shadow
      "HEI",   // HEICO — defense aerospace parts
      "LMT",   // Lockheed — Skunk Works UCAVs
      "BA",    // Boeing — MQ-25 Stingray, autonomous
    ],
  },
  space: {
    name: "Space",
    color: "#9d7eff",
    description:
      "Launch, satellite communications, earth observation, and space-based services. Beneficiaries of accelerating defense space spend (US Space Force, USSF) plus the commercial launch and constellation buildout.",
    tickers: [
      "RKLB",  // Rocket Lab — small launch + spacecraft
      "IRDM",  // Iridium — global satellite comms
      "ASTS",  // AST SpaceMobile — direct-to-cell
      "PL",    // Planet Labs — earth observation
      "VSAT",  // Viasat — satellite broadband
      "SATS",  // EchoStar — satellite/networks
      "BWXT",  // BWX Technologies — nuclear thermal propulsion
      "LMT",   // Lockheed — defense space systems
      "NOC",   // Northrop — sensors, JWST
      "BA",    // Boeing — Starliner, defense space
    ],
  },
  power: {
    name: "Power & Grid",
    color: "#ffd84d",
    description:
      "Independent power producers and grid equipment makers — the unglamorous picks-and-shovels of the AI data-center buildout. Every hyperscaler GW of compute requires contracted power and the gear to deliver it.",
    tickers: [
      "VST",   // Vistra — IPP (nuclear + gas)
      "CEG",   // Constellation Energy — nuclear-heavy IPP
      "TLN",   // Talen Energy — nuclear IPP (AWS deal)
      "NRG",   // NRG Energy — IPP
      "GEV",   // GE Vernova — grid + gas turbines
      "ETN",   // Eaton — power management
      "HUBB",  // Hubbell — electrical systems
      "VRT",   // Vertiv — DC power/cooling
      "POWL",  // Powell Industries — switchgear
    ],
  },
};

export const DEFAULT_SECTOR_ORDER = [
  "critical-minerals",
  "defense",
  "ai-infra",
  "nuclear",
  "energy",
  "cyber",
];
