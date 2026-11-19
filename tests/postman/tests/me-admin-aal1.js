const me = pm.response.json();
pm.test('aal1 Admin waits for TOTP', () => {
  pm.expect(me.user.email).to.equal('admin@demo');
  pm.expect(me.mfaRequired).to.equal(true);
  pm.expect(me.grants.filter((g) => g.scope === 'GLOBAL')).to.have.lengthOf(0);
});
