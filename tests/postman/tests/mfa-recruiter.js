pm.test('2FA optional and not set up', () => {
  const status = pm.response.json();
  pm.expect(status.aal).to.equal('aal1');
  pm.expect(status.required).to.equal(false);
  pm.expect(status.factors).to.have.lengthOf(0);
  pm.expect(status.canAddFactor).to.equal(true);
});
