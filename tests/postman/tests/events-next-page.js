pm.test('older event, not the first one again', () => {
  const page = pm.response.json();
  pm.expect(page.items).to.have.lengthOf(1);
  pm.expect(page.items[0].id).to.not.equal(
    pm.collectionVariables.get('events_first_id'),
  );
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
  pm.expect(pm.response.text()).to.not.include('inactive.recruiter@demo');
});
