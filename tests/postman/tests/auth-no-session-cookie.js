pm.test('no session cookie is issued', () => {
  const issued = pm.response.headers
    .all()
    .filter((h) => h.key.toLowerCase() === 'set-cookie')
    .filter(
      (h) =>
        /^sb-[^=]*-auth-token(\.\d+)?=[^;]+/.test(h.value) &&
        !/max-age=0/i.test(h.value),
    );
  pm.expect(issued.length, 'session cookies issued').to.equal(0);
});
