pm.test('a vertical outside the scope narrows the list to nothing', () => {
  pm.expect(pm.response.json()).to.deep.equal({ items: [] });
});
