import { describe, expect, it } from 'vitest';
import {
  buildCompareMatrix,
  buildHistoryTimeline,
  deriveUsage,
  resolveEffective,
} from '../src/lib/serializers.js';

describe('resolveEffective', () => {
  const parent = {
    logistics: { auto: 'Ingresso da via Roma', ztl: { present: true, hours: '7-19' } },
    addressLine: 'Via Roma 1',
    city: 'Milano',
    province: 'MI',
    postalCode: '20121',
    googleMapsUrl: 'https://maps.google.com/parent',
  };

  it('inherits address and logistics from parent when child fields are null', () => {
    const child = { logistics: null, addressLine: null, city: null, province: null, postalCode: null, googleMapsUrl: null };
    const result = resolveEffective(child, parent);
    expect(result.effective_address.address_line).toBe('Via Roma 1');
    expect(result.effective_address.city).toBe('Milano');
    expect(result.effective_logistics).toEqual(parent.logistics);
    expect(result.inherited_fields).toContain('logistics');
    expect(result.inherited_fields).toContain('address_line');
  });

  it('child values win and partial logistics merge over parent', () => {
    const child = {
      logistics: { auto: 'Ingresso secondario' },
      addressLine: 'Via Roma 1 - interno B',
      city: null,
      province: null,
      postalCode: null,
      googleMapsUrl: null,
    };
    const result = resolveEffective(child, parent);
    expect(result.effective_address.address_line).toBe('Via Roma 1 - interno B');
    expect(result.effective_address.city).toBe('Milano');
    expect(result.effective_logistics).toEqual({
      auto: 'Ingresso secondario',
      ztl: { present: true, hours: '7-19' },
    });
    expect(result.inherited_fields).not.toContain('address_line');
  });

  it('returns own values untouched for a root location', () => {
    const root = { logistics: { auto: 'ok' }, addressLine: 'Piazza Grande 2', city: 'Bologna', province: null, postalCode: null, googleMapsUrl: null };
    const result = resolveEffective(root, null);
    expect(result.effective_address.city).toBe('Bologna');
    expect(result.effective_logistics).toEqual({ auto: 'ok' });
    expect(result.inherited_fields).toEqual([]);
  });
});

describe('deriveUsage', () => {
  const row = (status: string) => ({
    projectId: 'p1',
    projectName: 'Progetto',
    eventId: 'e1',
    eventName: 'Evento',
    status: status as never,
    dateStart: '2026-10-01',
    dateEnd: null,
  });

  it('derives proposta from proposta+ statuses and utilizzata only from utilizzata', () => {
    expect(deriveUsage([row('preselezionata')])).toMatchObject({ proposta: false, utilizzata: false });
    expect(deriveUsage([row('proposta')])).toMatchObject({ proposta: true, utilizzata: false });
    expect(deriveUsage([row('scartata')])).toMatchObject({ proposta: false, utilizzata: false });
    expect(deriveUsage([row('utilizzata')])).toMatchObject({ proposta: true, utilizzata: true });
  });

  it('lists project/event entries with dates', () => {
    const usage = deriveUsage([row('confermata')]);
    expect(usage.entries).toHaveLength(1);
    expect(usage.entries[0]).toEqual({
      project: { id: 'p1', name: 'Progetto' },
      event: { id: 'e1', name: 'Evento' },
      status: 'confermata',
      dates: { start: '2026-10-01', end: null },
    });
  });
});

describe('buildHistoryTimeline', () => {
  it('merges all sources sorted by date descending', () => {
    const timeline = buildHistoryTimeline({
      visits: [{ id: 'v1', scheduledAt: new Date('2026-03-01T10:00:00Z'), outcome: 'ok', withClient: true, eventId: 'e1' }],
      quotes: [{ id: 'q1', amount: '9000', currency: 'EUR', status: 'ricevuto', receivedAt: new Date('2026-04-01T10:00:00Z'), eventId: 'e1' }],
      links: [{ eventId: 'e1', eventName: 'Gala', projectName: 'ACME', status: 'proposta', dateStart: '2026-05-01', createdAt: new Date('2026-02-01T10:00:00Z') }],
      feedback: [{ id: 'f1', ratings: { overall: 5 }, notes: 'Ottima', createdAt: new Date('2026-06-01T10:00:00Z') }],
    });
    expect(timeline.map((t) => t.type)).toEqual(['feedback', 'quote', 'site_visit', 'event_link']);
  });
});

describe('buildCompareMatrix', () => {
  it('builds capacity and price ranges per shortlist entry', () => {
    const matrix = buildCompareMatrix({
      shortlist: [{ id: 'el1', locationId: 'l1', locationName: 'Villa', status: 'proposta', matchScore: '87.5' }],
      capacities: new Map([['l1', [
        { configuration: 'tavoli_tondi', capacity: 150 },
        { configuration: 'tavoli_tondi', capacity: 90 },
        { configuration: 'in_piedi', capacity: 300 },
      ]]]),
      quotes: new Map([['el1', [{ amount: '8000', status: 'ricevuto' }, { amount: '9500', status: 'ricevuto' }]]]),
      availability: new Map([['el1', [{ date: '2026-10-15', status: 'opzionata' }]]]),
    });
    expect(matrix).toHaveLength(1);
    const row = matrix[0]!;
    expect(row.capacity_by_configuration).toEqual({ tavoli_tondi: 150, in_piedi: 300 });
    expect(row.max_capacity).toBe(300);
    expect(row.price_range).toEqual({ min: 8000, max: 9500 });
    expect(row.match_score).toBe(87.5);
    expect(row.availability).toEqual([{ date: '2026-10-15', status: 'opzionata' }]);
  });
});
