const request = require('supertest');
const app = require('../src/app');
const { warningsFor } = require('../src/config/env');

// The store listings link to these two pages, and the company that operates the
// app does not exist yet — so they have to be right both before and after its
// details are set, and must never pretend to name somebody they do not.
describe('Public legal pages', () => {
  const KEYS = ['LEGAL_NAME', 'LEGAL_ADDRESS', 'SUPPORT_EMAIL'];
  const saved = {};

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it.each(['/privacy', '/delete-account'])('serves %s as a web page outside /api', async (path) => {
    const res = await request(app).get(path);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('HisabKitab');
  });

  it('says the operator is not named yet rather than naming nobody', async () => {
    const res = await request(app).get('/privacy');
    expect(res.text).toContain('Operator details are being finalised');
    expect(res.text).not.toContain('HisabKitab is operated by');
  });

  it('names the operator once all three details are set, escaped', async () => {
    process.env.LEGAL_NAME = 'Hisab <Kitab> Pvt Ltd';
    process.env.LEGAL_ADDRESS = '12 Ring Road\\nSurat 395002';
    process.env.SUPPORT_EMAIL = 'support@example.in';

    const res = await request(app).get('/privacy');
    expect(res.text).toContain('HisabKitab is operated by');
    expect(res.text).toContain('Hisab &lt;Kitab&gt; Pvt Ltd');
    expect(res.text).not.toContain('<Kitab>');
    expect(res.text).toContain('12 Ring Road<br>Surat 395002');
    expect(res.text).toContain('mailto:support@example.in');
    expect(res.text).not.toContain('Operator details are being finalised');
  });

  it('tells someone without the app where to write, once there is an address', async () => {
    process.env.SUPPORT_EMAIL = 'support@example.in';
    const res = await request(app).get('/delete-account');
    expect(res.text).toContain('Settings');
    expect(res.text).toContain('mailto:support@example.in');
  });

  it('warns at startup in production while the details are missing, and only then', () => {
    expect(warningsFor({ NODE_ENV: 'production' })[0]).toContain('LEGAL_NAME, LEGAL_ADDRESS, SUPPORT_EMAIL');
    expect(warningsFor({ NODE_ENV: 'development' })).toEqual([]);
    expect(
      warningsFor({ NODE_ENV: 'production', LEGAL_NAME: 'X', LEGAL_ADDRESS: 'Y', SUPPORT_EMAIL: 'z@example.in' })
    ).toEqual([]);
  });
});
