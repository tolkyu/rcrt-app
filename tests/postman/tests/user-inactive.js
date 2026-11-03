pm.test('deactivated, activated before', () => {
  const user = pm.response.json();
  pm.expect(user.status).to.equal('DEACTIVATED');
  pm.expect(user.activatedAt).to.be.a('string');
  pm.expect(user.deactivatedAt).to.be.a('string');
});
