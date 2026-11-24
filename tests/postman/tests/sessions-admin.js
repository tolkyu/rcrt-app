pm.test('own open sessions, exactly one current', () => {
  const { items } = pm.response.json();
  pm.expect(items.filter((s) => s.current)).to.have.lengthOf(1);
  pm.expect(pm.response.text()).to.not.include('@demo');
});
