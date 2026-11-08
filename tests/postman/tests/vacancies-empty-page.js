pm.test('no items and no cursors for a vertical outside the scope', () => {
  pm.expect(pm.response.json()).to.deep.equal({
    items: [],
    nextCursor: null,
    prevCursor: null,
  });
});
