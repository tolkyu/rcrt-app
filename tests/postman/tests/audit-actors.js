pm.test('seeded recruiters are found', () => {
  const { items } = pm.response.json();
  pm.expect(items.length).to.be.at.least(3);
  items.forEach((a) =>
    pm.expect(a).to.have.all.keys('id', 'fullName', 'isActive'),
  );
});
