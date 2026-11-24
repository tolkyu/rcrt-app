pm.test('before TOTP: aal1, grants withheld, second device refused', () => {
  const status = pm.response.json();
  pm.expect(status.aal).to.equal('aal1');
  pm.expect(status.required).to.equal(true);
  pm.expect(status.factors).to.have.lengthOf(1);
  pm.expect(status.canAddFactor).to.equal(false);
});
