pm.test('exactly the current session', () => {
  const { items } = pm.response.json();
  pm.expect(items).to.have.lengthOf(1);
  pm.expect(items[0].current).to.equal(true);
});
