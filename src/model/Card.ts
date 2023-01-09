export class Card {
    public cardId: string
    public idTCGP: number
    public name: string
    public expIdTCGP: string
    public expName: string
    public expCardNumber: string
    public rarity: string
    public expCodeTCGP?: string
    public cardType?: string
    public energyType?: string
    public price?: number
    public pokedex?: number
    public releaseDate?: string
    public description?: string
    public variants?: string[]
    public vairantMap?: Variant[]
    public img?: string;
    //collection vrs
    public tags?: string[]
    public variant?: string
    public paid?: number
    public count?: number
    public grade?: string

    constructor(cardId: string, idTCGP: number, name: string, expId: string, expName: string, expCardNumber: string, rarity: string) {
        this.cardId = cardId
        this.idTCGP = idTCGP
        this.name = name
        this.expIdTCGP = expId
        this.expName = expName
        this.expCardNumber = expCardNumber
        this.rarity = rarity
    }

    public static collectionClone(card: Card, variant: string, count: number, paid?: number, grade?: string, tags?: string[]): Card {
        let copy = new Card(card.cardId, card.idTCGP, card.name, card.expIdTCGP, card.expName, card.expCardNumber, card.rarity);
        copy.expCodeTCGP = card.expCodeTCGP;
        copy.cardType = card.cardType;
        copy.energyType = card.energyType;
        copy.price = card.price;
        copy.pokedex = card.pokedex;
        copy.releaseDate = card.releaseDate;
        copy.variants = card.variants;
        copy.img = card.img;
        copy.variant = variant;
        copy.count = count;
        copy.paid = paid;
        copy.grade = grade;
        copy.tags = tags;
        return copy;
    }
}

export type Variant = {
    name: string,
    img: string,
    tcgp: number
}

export type Price = {
    date: string
    cardId: string
    variant: string
    rawPrice: number
    gradedPriceTen: number
    gradedPriceNine: number
}

export class LinkRequest {
    public type: string
    public card: Card
    constructor(type: string, card: Card) {
        this.card = card
        this.type = type
    }
}