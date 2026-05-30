const React = require('react');
function Image({ src, alt, fill, sizes, className, style, loading, width, height }) {
  return React.createElement('img', { src, alt, className, style, width: fill ? undefined : width, height: fill ? undefined : height });
}
module.exports = Image;
module.exports.default = Image;
