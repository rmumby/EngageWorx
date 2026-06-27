// TEMPORARY probe to prove the required `test` status check blocks merges on a failing test.
// This PR is never merged — it is closed and the branch deleted after the gate is demonstrated.
test('intentional failure to prove the CI test gate blocks merge', function() {
  expect(1).toBe(2);
});
