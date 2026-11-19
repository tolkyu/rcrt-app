pm.test('exactly the INVALID state, no invitee data', () => {
  pm.expect(pm.response.json()).to.deep.equal({ state: 'INVALID' });
});
