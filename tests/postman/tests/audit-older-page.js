const page = pm.response.json();
const newest = JSON.parse(pm.collectionVariables.get('audit_newest_ids'));
pm.test('older page continues after the first one', () => {
  pm.expect(page.items).to.have.lengthOf(2);
  page.items.forEach((e) => pm.expect(newest).to.not.include(e.id));
  pm.expect(page.prevCursor).to.be.a('string').with.length.above(0);
});
pm.collectionVariables.set('audit_prev_cursor', page.prevCursor);
