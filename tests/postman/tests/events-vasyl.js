pm.test('the invite is on the timeline, values never exposed', () => {
  const { items } = pm.response.json();
  pm.expect(items.map((e) => e.type)).to.include('user.invited');
  items.forEach((e) =>
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
  pm.expect(pm.response.text()).to.not.include('vasyl.tl@demo');
});
