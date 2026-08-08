import { describe, expect, it } from 'vitest';
import { resolveBrokerHost } from '../../src/integration/bambu/mqtt-adapter.js';

/**
 * SSRF / token-exfil allow-list for the MQTT broker host (MR-001, CWE-918).
 * The decrypted access token is sent to this host as the MQTT password, so a
 * hostile region/host value must never be able to redirect the connection.
 */
describe('resolveBrokerHost (MR-001 SSRF allow-list)', () => {
  it('maps known short region codes to the Bambu MQTT domain', () => {
    expect(resolveBrokerHost('us')).toBe('us.mqtt.bambulab.com');
    // There is no eu.mqtt.bambulab.com — legacy `eu` is aliased to the global
    // `us` cluster (see MQTT_REGIONS in @geekbox/shared constants).
    expect(resolveBrokerHost('eu')).toBe('us.mqtt.bambulab.com');
    expect(resolveBrokerHost('cn')).toBe('cn.mqtt.bambulab.com');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(resolveBrokerHost('  US ')).toBe('us.mqtt.bambulab.com');
  });

  it('accepts custom hostnames under the Bambu MQTT domain', () => {
    expect(resolveBrokerHost('west.mqtt.bambulab.com')).toBe('west.mqtt.bambulab.com');
    expect(resolveBrokerHost('mqtt.bambulab.com')).toBe('mqtt.bambulab.com');
  });

  it('rejects an attacker-controlled host (token would be exfiltrated)', () => {
    expect(() => resolveBrokerHost('evil.attacker.com')).toThrow(/disallowed/i);
    expect(() => resolveBrokerHost('us.mqtt.bambulab.com.attacker.com')).toThrow(/disallowed/i);
  });

  it('rejects userinfo, scheme, port, and path injection attempts', () => {
    expect(() => resolveBrokerHost('us.mqtt.bambulab.com@evil.com')).toThrow(/disallowed/i);
    expect(() => resolveBrokerHost('mqtts://evil.com')).toThrow(/disallowed/i);
    expect(() => resolveBrokerHost('evil.com:8883')).toThrow(/disallowed/i);
    expect(() => resolveBrokerHost('evil.com/path')).toThrow(/disallowed/i);
  });

  it('rejects a bare region that is not on the allow-list', () => {
    expect(() => resolveBrokerHost('xx')).toThrow(/disallowed/i);
  });
});
