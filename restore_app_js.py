import subprocess

old_js = subprocess.check_output(['git', 'show', '5014b24:app.js'], text=True, encoding='utf-8')
start_marker = "                        // --- Check for Stripe Redirect Success ---"
end_marker = "            } catch (err) {\n                console.error(\"Auth error:\", err);"

start_idx = old_js.find(start_marker)
end_idx = old_js.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print("Markers not found in old JS")
    exit(1)

missing_code = old_js[start_idx:end_idx]

with open('public/app.js', 'r', encoding='utf-8') as f:
    current_js = f.read()

target_marker = """                        } catch(err) {
                            hideLoader();
                            alert("Error initiating checkout: " + err.message);
                        }
                    }
                    }
                }
            } catch (err) {
                console.error("Auth error:", err);"""

if target_marker not in current_js:
    print("Target marker not found in current JS")
    exit(1)

replacement = """                        } catch(err) {
                            hideLoader();
                            alert("Error initiating checkout: " + err.message);
                        }
                    }

""" + missing_code + end_marker

new_js = current_js.replace(target_marker, replacement)

with open('public/app.js', 'w', encoding='utf-8') as f:
    f.write(new_js)

print("Successfully restored missing code!")
