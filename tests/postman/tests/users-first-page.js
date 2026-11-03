const page = pm.response.json();
pm.test('three rows, a count and a next page', () => {
  pm.expect(page.items).to.have.lengthOf(3);
  pm.expect(page.total).to.equal(
    Number(pm.collectionVariables.get('users_total')),
  );
  pm.expect(page.nextCursor).to.be.a('string').with.length.above(0);
});
pm.collectionVariables.set(
  'users_first_ids',
  JSON.stringify(page.items.map((u) => u.id)),
);
pm.collectionVariables.set('users_next_cursor', page.nextCursor);
