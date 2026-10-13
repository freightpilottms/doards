import { day } from "./seed.mjs";

export function enrichPresentation(s) {
  if (s.get("meta", "presentation-content-v1")) return;
  const at = (offset, hour = 9) =>
    `${day(offset)}T${String(hour).padStart(2, "0")}:00:00.000Z`;
  const add = (kind, value) => {
    if (s.get(kind, value.id)) return;
    s.put(kind, value);
    if (["vehicles", "rentals", "invoices", "workOrders"].includes(kind))
      s.audit("DEMO import", "demoSeed", kind, value.id, null, value);
  };
  const money = (n) => Math.round(n * 100) / 100;
  const company = {
    name: "S&S Fahrzeugverleih · DEMO",
    address: "Wien, Österreich · DEMO",
    email: "office@example.com",
    taxId: "DEMO-UID",
    iban: "DEMO",
    currency: "EUR",
    tax: 20,
  };
  s.transaction(() => {
    const companies = [
      "Donau Eventlogistik GmbH",
      "Alpen Kurier GmbH",
      "Westbahn Catering GmbH",
      "City Transfer Wien GmbH",
      "Steiner Montage GmbH",
      "Nordlicht Filmproduktion GmbH",
    ];
    const contacts = [
      "Julia Leitner",
      "Markus Wagner",
      "Nina Fischer",
      "Leon Gruber",
      "Sara Novak",
      "David Hofer",
    ];
    for (let i = 0; i < 6; i++)
      add("customers", {
        id: `SHOW-K-${i}`,
        name: contacts[i],
        company: companies[i],
        address: ["Wien", "Graz", "Linz"][i % 3] + ", Österreich · DEMO",
        email: `kontakt${i + 1}@example.com`,
        phone: "",
        license: `DEMO-FS-${i}`,
        identity: `DEMO-ID-${i}`,
      });
    for (let i = 0; i < 12; i++) {
      const base = s.get("vehicles", i % 2 ? "V-002" : "V-001");
      if (!base) continue;
      const id = `SHOW-V-${i + 1}`,
        customerId = `SHOW-K-${i % 6}`,
        mileage = 18000 + i * 3250;
      const workshop = i % 4 === 3;
      const vehicle = {
        ...base,
        id,
        plate: `DEMO ${i % 2 ? "VT" : "BT"} ${201 + i}`,
        vin: `DEMO-FLEET-${String(i + 1).padStart(6, "0")}`,
        mileage,
        baselineKm: mileage - 9000,
        status: workshop ? "maintenance" : "available",
        serviceKm: mileage + 6000,
        serviceDue: day(i === 3 ? 2 : 45 + i * 3),
        inspectionDue: day(20 + i * 12),
        insuranceDue: day(70 + i * 5),
        insuranceBroker: "Demo Versicherungspartner",
        insuranceEmail: "versicherung@example.com",
        insurancePolicy: `DEMO-POL-${i + 1}`,
        photos: {
          frontRight: i % 2 ? "/vehicle-vito-demo.jpg" : "/vehicle-bmw.jpg",
        },
        demoPhoto: true,
        trackerId: "",
        notes: "Präsentationsfahrzeug · fiktive Daten",
        location: workshop ? "Wien · Werkstatt" : "Wien · Zentrale",
      };
      add("vehicles", vehicle);
      add("locations", {
        id: `SHOW-LOC-${i}`,
        vehicleId: id,
        latitude: 48.16 + (i % 4) * 0.026,
        longitude: 16.3 + Math.floor(i / 4) * 0.045,
        accuracy: 20,
        source: "demo",
        at: at(0, 8),
        userId: "demo-admin",
      });
      add("services", {
        id: `SHOW-SVC-${i}`,
        vehicleId: id,
        kind: i % 2 ? "tires" : "major",
        description:
          i % 2
            ? "Winterräder montiert und geprüft"
            : "Inspektion: Öl, Filter und Bremskontrolle",
        date: day(-40 - i),
        mileage: mileage - 3500,
        nextDate: vehicle.serviceDue,
        nextKm: vehicle.serviceKm,
        supplier: "S&S Werkstatt",
        createdAt: at(-40 - i),
      });
      for (let period = 0; period < 2; period++) {
        const rentalId = `SHOW-MV-${i}-${period}`,
          end = period ? -60 : -7,
          start = end - 5 - (i % 3);
        const invoiceOffset = period
          ? end
          : -Math.min(new Date().getUTCDate() - 1, i % 4);
        const net = money((end - start) * vehicle.dayRate),
          gross = money(net * 1.2),
          invoiceId = `SHOW-RE-${i}-${period}`;
        const paid =
          period === 1
            ? gross
            : i % 3 === 0
              ? 0
              : i % 3 === 1
                ? money(gross / 2)
                : gross;
        add("rentals", {
          id: rentalId,
          vehicleId: id,
          customerId,
          driverId: "",
          start: day(start),
          end: day(end),
          rate: vehicle.dayRate,
          extras: 0,
          total: net,
          signedTotal: net,
          status: "returned",
          billingMode: "return",
          deposit: 500,
          depositHeld: 0,
          depositRetained: 0,
          includedKm: (end - start) * 200,
          extraKmRate: 0.3,
          outMileage: mileage - 5000 - period * 1500,
          inMileage: mileage - 4300 - period * 1500,
          outFuel: 100,
          inFuel: 100,
          handoverDamages: [],
          createdAt: at(start),
          returnedAt: at(end),
        });
        add("invoices", {
          id: invoiceId,
          number: `DEMO-SHOW-${new Date().getFullYear()}-${String(i * 2 + period + 1).padStart(3, "0")}`,
          rentalId,
          vehicleId: id,
          customerId,
          customer: s.get("customers", customerId),
          company,
          date: day(invoiceOffset),
          due: day(invoiceOffset + 14),
          net,
          vat: money(net * 0.2),
          gross,
          paid,
          status: paid === gross ? "paid" : "issued",
          lines: [
            {
              description: `${vehicle.make} ${vehicle.model} · ${vehicle.plate}`,
              quantity: end - start,
              price: vehicle.dayRate,
              tax: 20,
            },
          ],
          createdAt: at(invoiceOffset),
        });
        if (paid)
          add("payments", {
            id: `SHOW-PAY-${i}-${period}`,
            invoiceId,
            rentalId,
            vehicleId: id,
            amount: paid,
            type: "invoice",
            method: period ? "transfer" : "card",
            date: day(invoiceOffset),
            at: at(invoiceOffset, 12),
          });
      }
      if (!workshop) {
        const active = i % 3 !== 0,
          start = active ? -6 : 3,
          end = active ? 15 : 10;
        add("rentals", {
          id: `SHOW-ACTIVE-${i}`,
          vehicleId: id,
          customerId,
          driverId: "",
          start: day(start),
          end: day(end),
          rate: vehicle.dayRate,
          extras: 0,
          total: (end - start) * vehicle.dayRate,
          status: active ? "active" : "reserved",
          billingMode: "monthly",
          deposit: 500,
          depositHeld: active ? 500 : 0,
          depositRetained: 0,
          includedKm: (end - start) * 200,
          extraKmRate: 0.3,
          outMileage: mileage - 400,
          outFuel: 100,
          handoverDamages: [],
          createdAt: at(-8),
        });
      } else {
        add("workOrders", {
          id: `SHOW-WA-${i}`,
          vehicleId: id,
          customerId: "",
          description: [
            "Bremsen und Sicherheitskontrolle",
            "Inspektion und Ölwechsel",
            "Reifen und Achsvermessung",
          ][Math.floor(i / 4)],
          due: day(i === 3 ? 0 : 2),
          priority: i === 3 ? "high" : "normal",
          assignedTo: "demo-mechanic",
          status: i === 3 ? "progress" : "planned",
          hours: 0,
          laborCost: 38,
          laborRate: 75,
          parts: [],
          createdAt: at(-2),
        });
      }
      add("costs", {
        id: `SHOW-COST-${i}`,
        vehicleId: id,
        date: day(-Math.min(new Date().getUTCDate() - 1, i % 8)),
        category: "insurance",
        supplier: "Demo Versicherungspartner",
        description: "Versicherungsprämie · DEMO",
        net: 180 + i * 12,
        tax: 0,
        gross: 180 + i * 12,
        source: "manual",
      });
      add("tasks", {
        id: `SHOW-TASK-${i}`,
        title: workshop
          ? "Werkstattfreigabe prüfen"
          : "Fahrzeug für Übergabe vorbereiten",
        vehicleId: id,
        due: day(i % 5),
        assignedTo: workshop ? "demo-mechanic" : "demo-employee",
        done: i === 10,
      });
      if (i < 4)
        add("damages", {
          id: `SHOW-DAMAGE-${i}`,
          vehicleId: id,
          rentalId: "",
          description: [
            "Kratzer am hinteren Stoßfänger",
            "Steinschlag in der Frontscheibe",
            "Delle an der Seitentür",
            "Schramme an der Felge",
          ][i],
          angle: ["rear", "front", "left", "frontRight"][i],
          x: 0.35 + i * 0.08,
          y: 0.65,
          status: i === 3 ? "review" : "reported",
          createdAt: at(-5 - i),
          createdBy: "demo-employee",
          repairCost: 0,
          insurerShare: 0,
          customerShare: 0,
        });
      for (let j = 0; j < 2; j++)
        add("messages", {
          id: `SHOW-MSG-${i}-${j}`,
          vehicleId: id,
          channel: workshop ? "workshop" : "clients",
          customerId,
          rentalId: workshop ? "" : `SHOW-ACTIVE-${i}`,
          recipientId: "",
          senderId: j ? "demo-employee" : "demo-mechanic",
          sender: j ? "Marta Keller" : "Adnan Kovač",
          body: workshop
            ? j
              ? "Danke, bitte den Auftrag vor der Freigabe abschließen."
              : "Prüfung läuft. Benötigte Teile sind im Lager verfügbar."
            : j
              ? "Die Übergabe ist bestätigt. Die Unterlagen stehen bereit."
              : "Fahrzeug geprüft und für die Übergabe vorbereitet.",
          at: at(-1, 10 + j),
          attachments: [],
        });
    }
    const parts = [
      ["Luftfilter", "filter", "MANN", 18, 32],
      ["Bremsflüssigkeit DOT4", "oil", "ATE", 8, 16],
      ["Sommerreifen 225/55 R17", "tires", "Continental", 95, 135],
      ["Winterreifen 205/55 R16", "tires", "Michelin", 90, 129],
      ["Batterie 12V 80Ah", "other", "Bosch", 115, 169],
      ["Innenraumfilter", "filter", "MANN", 16, 29],
      ["Kühlmittel", "oil", "Febi", 9, 18],
      ["Bremsbeläge hinten", "brakes", "ATE", 48, 89],
    ];
    for (let i = 0; i < parts.length; i++) {
      const [name, category, manufacturer, costPrice, salePrice] = parts[i],
        articleId = `SHOW-ART-${i}`,
        stock = i === 2 ? 2 : 12 + i * 2;
      add("articles", {
        id: articleId,
        name,
        sku: `DEMO-PART-${100 + i}`,
        ean: "",
        manufacturer,
        category,
        unit: category === "oil" ? "l" : "pcs",
        stock,
        reserved: 0,
        minimum: 5,
        location: `C-${String(i + 1).padStart(2, "0")}`,
        costPrice,
        salePrice,
        tax: 20,
      });
      add("movements", {
        id: `SHOW-OPENING-${i}`,
        articleId,
        quantity: stock,
        type: "adjustment",
        reason: "Demo-Eröffnungsbestand",
        userId: "demo-warehouse",
        at: at(-30),
      });
      add("purchases", {
        id: `SHOW-PO-${i}`,
        articleId,
        supplier: "Demo Teilepartner GmbH",
        quantity: 10,
        received: 0,
        unitCost: costPrice,
        tax: 20,
        date: day(-1),
        status: "ordered",
        paid: false,
      });
    }
    add("meta", {
      id: "presentation-content-v1",
      at: new Date().toISOString(),
    });
  });
}
