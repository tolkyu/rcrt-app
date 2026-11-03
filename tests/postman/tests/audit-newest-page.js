const page = pm.response.json();
pm.test('first page: two rows, older ones follow, nothing newer', () => {
  pm.expect(page.items).to.have.lengthOf(2);
  pm.expect(page.nextCursor).to.be.a('string').with.length.above(0);
  pm.expect(page.prevCursor).to.equal(null);
});
pm.collectionVariables.set(
  'audit_newest_ids',
  JSON.stringify(page.items.map((e) => e.id)),
);
pm.collectionVariables.set('audit_next_cursor', page.nextCursor);
pm.collectionVariables.set('audit_record_id', page.items[0].id);
