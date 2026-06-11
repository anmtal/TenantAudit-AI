import re

with open('public/app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Replace the inner try block that has no matching catch for the outer try.
# From:
#             // Log audit to Database and reload profile
#             try {
#                 if (supabase) {

# To:
#             // Log audit to Database and reload profile
#                 if (supabase) {
js = js.replace('// Log audit to Database and reload profile\n            try {\n                if (supabase) {', '// Log audit to Database and reload profile\n                if (supabase) {')

with open('public/app.js', 'w', encoding='utf-8') as f:
    f.write(js)
