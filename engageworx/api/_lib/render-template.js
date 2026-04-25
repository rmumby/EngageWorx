// api/_lib/render-template.js — Simple {placeholder} substitution

function renderTemplate(template, vars) {
  if (!template) return '';
  var result = template;
  var keys = Object.keys(vars || {});
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var val = vars[key] !== null && vars[key] !== undefined ? String(vars[key]) : '';
    result = result.split('{' + key + '}').join(val);
  }
  return result;
}

module.exports = { renderTemplate: renderTemplate };
