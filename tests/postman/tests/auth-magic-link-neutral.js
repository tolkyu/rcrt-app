pm.test('neutral answer, identical for every address', () => {
  pm.expect(pm.response.json()).to.deep.equal({ accepted: true });
});
