import { day } from "./seed.mjs";

// Additive, versioned demo content: existing records and user edits are never reset.
export function enrichDemo(s) {
  const vito = s.get("vehicles", "V-002");
  if (vito && !Object.keys(vito.photos || {}).length)
    s.put("vehicles", {
      ...vito,
      photos: { frontRight: "/vehicle-vito-demo.jpg" },
      demoPhoto: true,
    });
  if (s.get("meta", "demo-content-v2")) {
    enrichIntelligenceDemo(s);
    enrichClientDemo(s);
    return;
  }
  const at = (offset, hour = 9) =>
    `${day(offset)}T${String(hour).padStart(2, "0")}:00:00.000Z`;
  const add = (kind, r) => {
    if (!s.get(kind, r.id)) s.put(kind, r);
  };
  s.transaction(() => {
    const company = {
      name: "S&S Fahrzeugverleih",
      address: "DEMO · Wien, Österreich",
      taxId: "DEMO-UID",
      email: "office@example.com",
      iban: "DEMO",
      currency: "EUR",
      tax: 20,
    };
    for (let i = 0; i < 8; i++) {
      const customer = s.get("customers", i % 2 ? "K-002" : "K-001");
      const v = s.all("vehicles")[i % 6];
      const id = `DEMO-MV-${i + 1}`,
        days = 3 + (i % 4),
        net = days * v.dayRate;
      add("rentals", {
        id,
        vehicleId: v.id,
        customerId: i % 2 ? "K-002" : "K-001",
        driverId: "",
        start: day(-25 - i * 20),
        end: day(-25 - i * 20 + days),
        rate: v.dayRate,
        extras: 0,
        deposit: 500,
        depositHeld: 0,
        depositRetained: 0,
        total: net,
        signedTotal: net,
        status: "returned",
        includedKm: days * 200,
        extraKmRate: 0.3,
        outMileage: v.mileage - 1500 - i * 100,
        inMileage: v.mileage - 900 - i * 100,
        returnedAt: at(-25 - i * 20 + days),
        outFuel: 100,
        inFuel: 100,
        handoverDamages: [],
        createdAt: at(-25 - i * 20),
      });
      add("invoices", {
        id: `DEMO-RE-${i + 1}`,
        number: `DEMO-${new Date().getFullYear()}-${String(i + 1).padStart(4, "0")}`,
        rentalId: id,
        vehicleId: v.id,
        customerId: customer.id,
        customer,
        company,
        date: day(-20 - i * 20),
        due: day(i === 0 ? -3 : 14 - i * 20),
        net,
        vat: Math.round(net * 0.2 * 100) / 100,
        gross: Math.round(net * 1.2 * 100) / 100,
        paid: i === 0 ? 0 : Math.round(net * 1.2 * 100) / 100,
        status: i === 0 ? "issued" : "paid",
        lines: [
          {
            description: `${v.plate} · ${id}`,
            quantity: days,
            price: v.dayRate,
            tax: 20,
          },
        ],
        createdAt: at(-20 - i * 20),
      });
      if (i)
        add("payments", {
          id: `DEMO-PAY-${i}`,
          invoiceId: `DEMO-RE-${i + 1}`,
          rentalId: id,
          vehicleId: v.id,
          amount: Math.round(net * 1.2 * 100) / 100,
          type: "invoice",
          method: i % 2 ? "card" : "transfer",
          date: day(-18 - i * 20),
          at: at(-18 - i * 20),
        });
      add("costs", {
        id: `DEMO-COST-${i}`,
        vehicleId: v.id,
        date: day(-8 - i * 17),
        category: i % 2 ? "service" : "insurance",
        supplier: i % 2 ? "Auto Service Wien" : "Allianz",
        description:
          i % 2 ? "Inspektion und Filterwechsel" : "Versicherungsprämie",
        net: 90 + i * 25,
        tax: 20,
        gross: (90 + i * 25) * 1.2,
        source: "manual",
      });
    }
    for (let i = 0; i < 6; i++) {
      const v = s.all("vehicles")[i];
      add("services", {
        id: `DEMO-SVC-${i}`,
        vehicleId: v.id,
        kind: i % 2 ? "tires" : "major",
        description:
          i % 2
            ? "Reifenwechsel und Reifendruckkontrolle"
            : "Ölwechsel, Filter und Sicherheitskontrolle",
        date: day(-30 - i * 12),
        mileage: Math.max(0, v.mileage - 3500),
        nextDate: day(25 + i * 14),
        nextKm: v.mileage + 10000,
        supplier: "S&S Werkstatt",
        createdAt: at(-30 - i * 12),
      });
      add("locations", {
        id: `DEMO-LOC-${i}`,
        vehicleId: v.id,
        latitude: 48.2082 + [0.014, -0.025, 0.049, 0.007, -0.061, 0.03][i],
        longitude: 16.3738 + [0.01, 0.04, -0.06, -0.02, 0.08, 0.12][i],
        accuracy: 25,
        source: "demo",
        at: at(0),
        userId: "demo-admin",
      });
    }
    for (let i = 0; i < 4; i++) {
      const v = s.all("vehicles")[[0, 2, 5, 3][i]];
      add("workOrders", {
        id: `DEMO-WA-${i + 1}`,
        vehicleId: v.id,
        customerId: "",
        description: [
          "Reifenwechsel · Winterräder",
          "Pickerl-Vorbereitung",
          "Klimaanlage prüfen",
          "Bremsflüssigkeit wechseln",
        ][i],
        due: day(i - 1),
        priority: i === 0 ? "high" : "normal",
        assignedTo: "demo-mechanic",
        status: i === 3 ? "complete" : "planned",
        hours: i === 3 ? 1.5 : 0,
        laborCost: 38,
        laborRate: 75,
        parts:
          i === 3
            ? [
                {
                  articleId: "ART-001",
                  name: "Motoröl 5W30",
                  quantity: 2,
                  cost: 7,
                  price: 12,
                  tax: 20,
                },
              ]
            : [],
        createdAt: at(-3),
        completedAt: i === 3 ? at(-1) : null,
      });
      add("purchases", {
        id: `DEMO-BE-${i + 1}`,
        articleId: `ART-00${i + 1}`,
        supplier: [
          "Auto Teile Wien",
          "MANN Partner",
          "ATE Austria",
          "Bosch Service",
        ][i],
        quantity: 10,
        received: i === 0 ? 10 : i === 1 ? 4 : 0,
        unitCost: [7, 15, 65, 12][i],
        tax: 20,
        date: day(-4 + i),
        status: i === 0 ? "received" : i === 1 ? "partial" : "ordered",
        invoiceNumber: i === 0 ? "DEMO-SUP-101" : "",
        paid: i === 0,
      });
      add("movements", {
        id: `DEMO-MOV-${i + 1}`,
        articleId: `ART-00${i + 1}`,
        quantity: i === 0 ? 10 : -1,
        type: i === 0 ? "purchase" : "workshop",
        workOrderId: i ? "DEMO-WA-4" : "",
        reason: "Demo-Historie",
        userId: i ? "demo-mechanic" : "demo-warehouse",
        at: at(-4 + i),
      });
      add("tasks", {
        id: `DEMO-TASK-${i + 1}`,
        title: [
          "Winterreifen bestellen",
          "Pickerl-Termin bestätigen",
          "Rückgabe vorbereiten",
          "Versicherungspolice prüfen",
        ][i],
        vehicleId: v.id,
        due: day(i - 1),
        assignedTo: i % 2 ? "demo-mechanic" : "demo-employee",
        done: i === 3,
      });
    }
    for (let i = 0; i < 3; i++)
      add("repairs", {
        id: `DEMO-REP-${i + 1}`,
        vehicleId: `V-00${i + 1}`,
        type: i % 2 ? "internal" : "external",
        description: [
          "Stoßfänger lackiert",
          "Spiegelgehäuse ersetzt",
          "Batterie erneuert",
        ][i],
        date: day(-15 - i * 7),
        mileage: 22000 + i * 9000,
        supplier: i % 2 ? "S&S Werkstatt" : "Auto Service Wien",
        net: 150 + i * 90,
        tax: 20,
        gross: (150 + i * 90) * 1.2,
        status: "complete",
        createdAt: at(-15 - i * 7),
      });
    add("damages", {
      id: "DEMO-SCH-2",
      vehicleId: "V-002",
      rentalId: "MV-2026-001",
      description: "Kleine Delle an der linken Schiebetür",
      angle: "left",
      x: 0.5,
      y: 0.6,
      status: "reported",
      createdAt: at(-2),
      createdBy: "demo-driver",
      repairCost: 0,
      insurerShare: 0,
      customerShare: 0,
    });
    const conversations = [
      [
        "V-002",
        "clients",
        "demo-driver",
        "Amir Hadžić",
        "Guten Morgen, die Übergabe hat gut geklappt.",
        -1,
        9,
      ],
      [
        "V-002",
        "clients",
        "demo-employee",
        "Marta Keller",
        "Danke! Die Rückgabe ist für Freitag eingeplant. Bei Fragen sind wir hier erreichbar.",
        -1,
        10,
      ],
      [
        "V-002",
        "clients",
        "demo-client",
        "Anna Müller",
        "Bitte die kleine Delle an der Schiebetür im Protokoll vermerken.",
        0,
        8,
      ],
      [
        "V-002",
        "clients",
        "demo-employee",
        "Marta Keller",
        "Die Meldung ist erfasst. Die Werkstatt prüft sie nach der Rückgabe.",
        0,
        9,
      ],
      [
        "V-004",
        "workshop",
        "demo-employee",
        "Marta Keller",
        "Bitte zuerst die Bremsen vorne prüfen. Fahrzeug wird morgen benötigt.",
        -1,
        8,
      ],
      [
        "V-004",
        "workshop",
        "demo-mechanic",
        "Adnan Kovač",
        "Prüfung läuft. Bremsbeläge sind im Lager vorhanden.",
        -1,
        9,
      ],
      [
        "V-004",
        "workshop",
        "demo-warehouse",
        "Lukas Weber",
        "Ein Satz liegt in B-01 bereit. Bitte Entnahme am Auftrag buchen.",
        0,
        8,
      ],
      [
        "V-001",
        "workshop",
        "demo-mechanic",
        "Adnan Kovač",
        "Winterräder sind vorbereitet. Termin bitte bestätigen.",
        0,
        9,
      ],
      [
        "V-005",
        "clients",
        "demo-employee",
        "Marta Keller",
        "Bitte bei der Rückgabe beide Schlüssel mitbringen.",
        0,
        10,
      ],
    ];
    conversations.forEach(
      ([vehicleId, channel, senderId, sender, body, offset, hour], i) =>
        add("messages", {
          id: `DEMO-MSG-${i + 1}`,
          vehicleId,
          channel,
          senderId,
          sender,
          body,
          at: at(offset, hour),
          rentalId: vehicleId === "V-002" ? "MV-2026-001" : "",
          customerId: vehicleId === "V-002" ? "K-001" : "K-003",
          recipientId: vehicleId === "V-002" ? "demo-driver" : "",
          attachments: [],
        }),
    );
    const pdf = demoPdf();
    ["V-001", "V-002", "V-004"].forEach((vehicleId, i) =>
      add("documents", {
        id: `DEMO-DOC-${i + 1}`,
        ownerKind: "vehicles",
        ownerId: vehicleId,
        vehicleId,
        title: [
          "Zulassung · Demo",
          "Übergabeprotokoll · Demo",
          "Servicebeleg · Demo",
        ][i],
        category: "other",
        type: "other",
        date: day(-3),
        file: pdf,
        fileName: `DOARDS-demo-${i + 1}.pdf`,
        financial: false,
        shared: true,
        createdAt: at(-3),
        expires: day(180),
      }),
    );
    for (const [id, surface, view, body] of [
      ["demo-admin", "board", "workOrders", "Bremsen vorne · WA-001"],
      ["demo-client", "clients", "messages", "W-CD 9012 · Rückgabe"],
      ["demo-driver", "clients", "damages", "W-CD 9012 · Schadensmeldung"],
      ["demo-mechanic", "workshop", "workOrders", "Bremsen vorne · WA-001"],
      ["demo-warehouse", "workshop", "articles", "Ölfilter · A-02"],
    ])
      add("notifications", {
        id: `DEMO-N-${id}`,
        userId: id,
        surface,
        view,
        title: view,
        body,
        at: at(0),
        severity: "normal",
        vehicleId: view === "articles" ? "" : "V-002",
      });
    const mechanic = s.db
      .prepare("SELECT access FROM users WHERE id=?")
      .get("demo-mechanic");
    if (mechanic && mechanic.access === "{}")
      s.db.prepare("UPDATE users SET access=?,customerId=? WHERE id=?").run(
        JSON.stringify({
          apps: { clients: true, workshop: true },
          clientScope: { view: true },
        }),
        "K-001",
        "demo-mechanic",
      );
    add("meta", { id: "demo-content-v2", at: new Date().toISOString() });
  });
  enrichIntelligenceDemo(s);
  enrichClientDemo(s);
}
function enrichClientDemo(s) {
  if (s.get("meta", "demo-clients-v1")) return;
  const add = (kind, record) => {
    if (!s.get(kind, record.id)) s.put(kind, record);
  };
  s.transaction(() => {
    for (const [i, name, company, city] of [
      [4, "Sophie Berger", "Berger Eventservice GmbH", "Salzburg"],
      [5, "David Huber", "", "Wien"],
      [6, "Lejla Kovac", "Adria Kurier GmbH", "Graz"],
    ])
      add("customers", {
        id: `DEMO-K-${i}`,
        name,
        company,
        address: `${city}, Österreich`,
        email: `kunde${i}@example.com`,
        phone: "",
        license: `DEMO-AT-${i}`,
        identity: `DEMO-${i}`,
      });
    for (const [i, baseId, status, start, end] of [
      [1, "V-001", "active", -12, 18],
      [2, "V-002", "reserved", 4, 11],
    ]) {
      const base = s.get("vehicles", baseId);
      if (!base) continue;
      const vehicleId = `DEMO-CLIENT-V${i}`,
        rentalId = `DEMO-CLIENT-MV${i}`;
      add("vehicles", {
        ...base,
        id: vehicleId,
        plate: `DEMO-${i === 1 ? "B 210" : "V 320"}`,
        vin: `DEMO-CLIENT-${i}`,
        status: "available",
        mileage: i === 1 ? 28640 : 18750,
        serviceKm: 40000,
        serviceDue: day(90),
        inspectionDue: day(180),
        fuel: 100,
        photos: {
          frontRight: i === 1 ? "/vehicle-bmw.jpg" : "/vehicle-vito-demo.jpg",
        },
        demoPhoto: true,
        notes: "Demo · Kundenportal",
        trackerId: "",
      });
      add("rentals", {
        id: rentalId,
        vehicleId,
        customerId: "K-001",
        driverId: "",
        start: day(start),
        end: day(end),
        rate: base.dayRate,
        extras: 0,
        total: (end - start) * base.dayRate,
        deposit: 500,
        depositHeld: status === "active" ? 500 : 0,
        depositRetained: 0,
        includedKm: (end - start) * 200,
        extraKmRate: 0.3,
        status,
        outMileage: i === 1 ? 27900 : 18750,
        outFuel: 100,
        paymentMethod: "transfer",
        handoverDamages: [],
        createdAt: day(start - 2) + "T09:00:00Z",
      });
      if (status === "active")
        add("locations", {
          id: `DEMO-CLIENT-LOC${i}`,
          vehicleId,
          latitude: 48.2176,
          longitude: 16.3963,
          accuracy: 30,
          source: "demo",
          at: day() + "T09:00:00Z",
          userId: "demo-client",
        });
    }
    for (const [id, vehicleId, rentalId, title, type] of [
      [
        1,
        "V-002",
        "MV-2026-001",
        "Mietunterlagen · Vito Tourer · Demo",
        "contract",
      ],
      [
        2,
        "V-002",
        "MV-2026-001",
        "Fahrzeugunterlagen · Vito Tourer · Demo",
        "other",
      ],
      [
        3,
        "DEMO-CLIENT-V1",
        "DEMO-CLIENT-MV1",
        "Übergabeprotokoll · BMW Touring · Demo",
        "other",
      ],
      [
        4,
        "DEMO-CLIENT-V2",
        "DEMO-CLIENT-MV2",
        "Reservierung · Vito Tourer · Demo",
        "other",
      ],
    ])
      if (s.get("rentals", rentalId))
        add("documents", {
          id: `DEMO-CLIENT-DOC${id}`,
          ownerKind: "rentals",
          ownerId: rentalId,
          vehicleId,
          rentalId,
          title,
          type,
          category: type,
          date: day(-1),
          file: demoPdf(),
          fileName: `DOARDS-Client-Demo-${id}.pdf`,
          financial: false,
          shared: true,
          createdAt: day(-1) + "T09:00:00Z",
        });
    for (const [i, userId, view, title, body] of [
      [
        1,
        "demo-client",
        "documents",
        "documents",
        "BMW Touring · Übergabeprotokoll",
      ],
      [
        2,
        "demo-client",
        "messages",
        "messages",
        "Vito Tourer · Abholung Wien Zentrale",
      ],
      [
        3,
        "demo-driver",
        "documents",
        "documents",
        "Vito Tourer · Fahrzeugunterlagen",
      ],
    ])
      add("notifications", {
        id: `DEMO-CLIENT-N${i}`,
        userId,
        surface: "clients",
        view,
        title,
        body,
        severity: "normal",
        vehicleId: "V-002",
        at: day() + "T08:30:00Z",
      });
    add("meta", { id: "demo-clients-v1", at: new Date().toISOString() });
  });
}
function enrichIntelligenceDemo(s) {
  if (s.get("meta", "demo-intelligence-v1")) return;
  s.transaction(() => {
    const base = s.get("vehicles", "V-006");
    if (base && !s.get("vehicles", "DEMO-V-MONTH")) {
      s.put("vehicles", {
        ...base,
        id: "DEMO-V-MONTH",
        plate: "DEMO-M 100",
        vin: "DEMO-MONTHLY",
        mileage: 42000,
        trackerId: "",
        photos: {},
        notes: "Monthly billing demonstration",
      });
      s.put("rentals", {
        id: "DEMO-MONTH-1",
        vehicleId: "DEMO-V-MONTH",
        customerId: "K-002",
        driverId: "",
        start: day(-75),
        end: day(25),
        rate: 80,
        extras: 50,
        total: 8050,
        status: "active",
        billingMode: "monthly",
        deposit: 500,
        depositHeld: 500,
        includedKm: 10000,
        extraKmRate: 0.3,
        outMileage: 40000,
        outFuel: 100,
        createdAt: day(-76) + "T09:00:00Z",
      });
    }
    s.put("meta", { id: "demo-intelligence-v1" });
  });
}
function demoPdf() {
  const stream =
    "BT /F1 18 Tf 50 780 Td (DOARDS - DEMO DOCUMENT) Tj 0 -35 Td /F1 11 Tf (Sample attachment. Not valid for business use.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return "data:application/pdf;base64," + Buffer.from(pdf).toString("base64");
}
