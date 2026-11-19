const page = pm.response.json();
pm.test('one event and an older page', () => {
  pm.expect(page.items).to.have.lengthOf(1);
  pm.expect(page.nextCursor).to.be.a('string').with.length.above(0);
});
pm.test('event fields only, no subject email', () => {
  page.items.forEach((e) =>
    pm
      .expect(e)
      .to.have.all.keys(
        'id',
        'type',
        'occurredAt',
        'actorKind',
        'actor',
        'roles',
        'fields',
        'priorityChange',
      ),
  );
  pm.expect(pm.response.text()).to.not.include('yuliia.petrenko@demo');
});
pm.collectionVariables.set('events_first_id', page.items[0].id);
pm.collectionVariables.set('events_next_cursor', page.nextCursor);
