function generatePassword() {
    // Default password length and character options
    const length = 12;
    const includeUpper = true;
    const includeNumbers = true;
    const includeSymbols = true;

    // Define character pools
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+[]{}|;:,.<>?';

    // Build the character set
    let characterPool = lowercase;
    if (includeUpper) characterPool += uppercase;
    if (includeNumbers) characterPool += numbers;
    if (includeSymbols) characterPool += symbols;

    if (characterPool.length === 0) {
        throw new Error('Character pool is empty. Enable at least one option.');
    }

    // Generate the password
    let password = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characterPool.length);
        password += characterPool[randomIndex];
    }

    return password;
}

module.exports = {
    generatePassword,
};