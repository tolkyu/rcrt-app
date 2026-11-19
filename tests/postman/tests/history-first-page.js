const page = pm.response.json();
pm.test('one own entry and an older page', () => {
  pm.expect(page.items).to.have.lengthOf(1);
  pm.expect(page.nextCursor).to.be.a('string').with.length.above(0);
});
pm.collectionVariables.set('history_first_id', page.items[0].id);
pm.collectionVariables.set('history_next_cursor', page.nextCursor);
