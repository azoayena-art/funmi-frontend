// src/utils/rowLevelPermissions.test.ts
import { describe, it, expect } from 'vitest';
import {
  getTeamPermissions,
  verifyTeamAccess,
  checkTeamAccess,
} from './rowLevelPermissions';

describe('getTeamPermissions', () => {
  it('génère read/update/delete pour l’équipe', () => {
    const perms = getTeamPermissions('team123');
    expect(perms).toContain('read("team:team123")');
    expect(perms).toContain('update("team:team123")');
    expect(perms).toContain('delete("team:team123")');
  });

  it('ajoute read("any") en mode public', () => {
    const perms = getTeamPermissions('team123', { isPublic: true });
    expect(perms).toContain('read("any")');
  });

  it('ne génère que la lecture en mode readOnly', () => {
    const perms = getTeamPermissions('team123', { readOnly: true });
    expect(perms).toEqual(['read("team:team123")']);
  });
});

describe('verifyTeamAccess', () => {
  it('autorise un document de la même équipe', () => {
    expect(verifyTeamAccess({ teamId: 'A' }, 'A')).toBe(true);
  });

  it('bloque un document d’une autre équipe', () => {
    expect(verifyTeamAccess({ teamId: 'A' }, 'B')).toBe(false);
  });

  it('bloque un document sans teamId', () => {
    expect(verifyTeamAccess({}, 'A')).toBe(false);
    expect(verifyTeamAccess(null, 'A')).toBe(false);
  });
});

describe('checkTeamAccess', () => {
  it('retourne valid: true pour la bonne équipe', () => {
    const res = checkTeamAccess({ teamId: 'A' }, 'A');
    expect(res.valid).toBe(true);
  });

  it('retourne valid: false avec reason pour une autre équipe', () => {
    const res = checkTeamAccess({ teamId: 'A' }, 'B');
    expect(res.valid).toBe(false);
    expect(res.reason).toBeTruthy();
  });
});